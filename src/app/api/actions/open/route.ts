import { NextResponse } from "next/server";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { loadConfig, EDITOR_OPTIONS, GIT_GUI_OPTIONS, BROWSER_OPTIONS } from "@/lib/config";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

type ActionType = "iterm" | "editor" | "finder" | "git-gui" | "send-message" | "send-keystroke" | "open-url";

async function getTtyForPid(pid: number): Promise<string> {
  const { stdout: ttyOut } = await execFileAsync("ps", ["-o", "tty=", "-p", String(pid)], {
    timeout: 5000,
  });
  const tty = ttyOut.trim();
  if (!tty || tty === "?") {
    throw new Error(`No TTY found for PID ${pid}`);
  }
  return tty.startsWith("/") ? tty : `/dev/${tty}`;
}

async function sendMessageToSession(pid: number, message: string): Promise<void> {
  const ttyPath = await getTtyForPid(pid);

  // Escape message for AppleScript string context
  const asEscaped = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${ttyPath}" then
          tell aSession
            write text "${asEscaped}"
          end tell
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;

  await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
}

async function sendKeystrokeToSession(pid: number, keystroke: string): Promise<void> {
  const ttyPath = await getTtyForPid(pid);

  // For simple keystrokes, use iTerm's write text (no focus needed).
  // "write text" sends text + newline to the session via the pty master.
  // For escape, use "write text (ASCII character 27)" to send ESC without newline.
  const itermWriteMap: Record<string, string> = {
    return: `write text ""`,           // sends just a newline
    escape: `write text (ASCII character 27) newline NO`,  // sends ESC byte, no newline
    y: `write text "y"`,
    n: `write text "n"`,
  };

  const writeCmd = itermWriteMap[keystroke];
  if (writeCmd) {
    const script = `
tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${ttyPath}" then
          tell aSession
            ${writeCmd}
          end tell
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;
    await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
    return;
  }

  // Arrow keys and other special keys need System Events (requires iTerm focus)
  let asKeystroke: string;
  switch (keystroke) {
    case "up":
      asKeystroke = `key code 126`;
      break;
    case "down":
      asKeystroke = `key code 125`;
      break;
    case "tab":
      asKeystroke = `key code 48`;
      break;
    case "space":
      asKeystroke = `keystroke " "`;
      break;
    default:
      asKeystroke = `keystroke "${keystroke.replace(/"/g, '\\"')}"`;
  }

  const focusScript = `
tell application "iTerm"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${ttyPath}" then
          select aWindow
          select aTab
          select aSession
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;

  await execFileAsync("osascript", ["-e", focusScript], { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 150));

  const keystrokeScript = `
tell application "System Events"
  tell process "iTerm2"
    ${asKeystroke}
  end tell
end tell`;

  await execFileAsync("osascript", ["-e", keystrokeScript], { timeout: 5000 });
}

async function focusItermByPid(pid: number): Promise<void> {
  const { stdout: ttyOut } = await execFileAsync("ps", ["-o", "tty=", "-p", String(pid)], {
    timeout: 5000,
  });
  const tty = ttyOut.trim();
  if (!tty || tty === "?") {
    throw new Error(`No TTY found for PID ${pid}`);
  }
  const ttyPath = tty.startsWith("/") ? tty : `/dev/${tty}`;

  const script = `
tell application "iTerm"
  activate
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${ttyPath}" then
          select aWindow
          select aTab
          select aSession
          return
        end if
      end repeat
    end repeat
  end repeat
end tell`;

  await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 5000 });
}

/**
 * Move the frontmost window of an app to a target screen.
 * screenIndex 0 = primary/main screen, 1 = secondary, etc.
 */
async function moveAppToScreen(appName: string, screenIndex: number): Promise<void> {
  const script = `
use framework "AppKit"

set screens to current application's NSScreen's screens()
set screenCount to count of screens

if ${screenIndex} >= screenCount then
  return "no screen"
end if

-- Get target screen frame: frame() returns {{originX, originY}, {width, height}}
set targetScreen to item (${screenIndex} + 1) of screens
set f to targetScreen's frame()
set sx to item 1 of item 1 of f as integer
set sy to item 2 of item 1 of f as integer
set sw to item 1 of item 2 of f as integer
set sh to item 2 of item 2 of f as integer

-- Primary screen height for coordinate conversion (NSScreen is bottom-left origin, AppleScript is top-left)
set pf to (item 1 of screens)'s frame()
set primaryHeight to item 2 of item 2 of pf as integer
set asY to primaryHeight - sy - sh

-- Move the frontmost window of the app to the target screen
tell application "${appName}"
  if (count of windows) > 0 then
    set bounds of front window to {sx + 50, asY + 50, sx + sw - 50, asY + sh - 50}
  end if
end tell

return "ok"
`;

  try {
    await execAsync(`osascript -l AppleScript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 5000 });
  } catch {
    // Silently fail — window positioning is best-effort
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, path, pid, targetScreen, message, url, keystroke } = body as {
      action: ActionType;
      path?: string;
      pid?: number;
      targetScreen?: number;
      message?: string;
      url?: string;
      keystroke?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    if (action !== "iterm" && action !== "send-message" && action !== "send-keystroke" && action !== "open-url") {
      if (!path) {
        return NextResponse.json({ error: "Missing path" }, { status: 400 });
      }
      try {
        await stat(path);
      } catch {
        return NextResponse.json({ error: "Path does not exist" }, { status: 404 });
      }
    }

    switch (action) {
      case "iterm":
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for iTerm action" }, { status: 400 });
        }
        await focusItermByPid(pid);
        break;
      case "editor": {
        const config = await loadConfig();
        const editorDef = EDITOR_OPTIONS.find((e) => e.id === config.editor) ?? EDITOR_OPTIONS[0];
        await execFileAsync(editorDef.command, [path!]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 800));
          await moveAppToScreen(editorDef.appName, targetScreen);
        }
        break;
      }
      case "finder":
        await execFileAsync("open", [path!]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 500));
          await moveAppToScreen("Finder", targetScreen);
        }
        break;
      case "git-gui": {
        const gitConfig = await loadConfig();
        const guiDef = GIT_GUI_OPTIONS.find((g) => g.id === gitConfig.gitGui) ?? GIT_GUI_OPTIONS[0];
        await execFileAsync("open", ["-a", guiDef.appName, path!]);
        if (targetScreen !== undefined) {
          await new Promise((r) => setTimeout(r, 800));
          await moveAppToScreen(guiDef.appName, targetScreen);
        }
        break;
      }
      case "send-message":
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for send-message action" }, { status: 400 });
        }
        if (!message) {
          return NextResponse.json({ error: "Missing message" }, { status: 400 });
        }
        await sendMessageToSession(pid, message);
        break;
      case "send-keystroke":
        if (!pid) {
          return NextResponse.json({ error: "Missing pid for send-keystroke action" }, { status: 400 });
        }
        if (!keystroke) {
          return NextResponse.json({ error: "Missing keystroke" }, { status: 400 });
        }
        await sendKeystrokeToSession(pid, keystroke);
        break;
      case "open-url": {
        if (!url) {
          return NextResponse.json({ error: "Missing url" }, { status: 400 });
        }
        const browserConfig = await loadConfig();
        const browserDef = BROWSER_OPTIONS.find((b) => b.id === browserConfig.browser) ?? BROWSER_OPTIONS[0];
        const escapedUrl = url.replace(/"/g, '\\"');

        // Chromium-based browsers support tab reuse via AppleScript
        const chromiumBrowsers = ["Google Chrome", "Arc", "Brave Browser", "Microsoft Edge"];
        if (chromiumBrowsers.includes(browserDef.appName)) {
          const script = `
tell application "${browserDef.appName}"
  set found to false
  repeat with aWindow in windows
    set tabIndex to 0
    repeat with aTab in tabs of aWindow
      set tabIndex to tabIndex + 1
      if URL of aTab starts with "${escapedUrl}" then
        set active tab index of aWindow to tabIndex
        set index of aWindow to 1
        activate
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  if not found then
    activate
    open location "${escapedUrl}"
  end if
end tell`;
          try {
            await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
          } catch {
            await execFileAsync("open", ["-a", browserDef.appName, url]);
          }
        } else {
          // Safari/Firefox — just open (tab reuse not easily scriptable)
          await execFileAsync("open", ["-a", browserDef.appName, url]);
        }
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Action failed:", error);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
