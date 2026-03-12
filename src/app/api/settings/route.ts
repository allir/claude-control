import { NextResponse } from "next/server";
import { loadConfig, saveConfig, AppConfig, EDITOR_OPTIONS, GIT_GUI_OPTIONS, BROWSER_OPTIONS } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json({
      config,
      options: {
        editors: EDITOR_OPTIONS,
        gitGuis: GIT_GUI_OPTIONS,
        browsers: BROWSER_OPTIONS,
      },
    });
  } catch (error) {
    console.error("Failed to load settings:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const current = await loadConfig();

    const updated: AppConfig = {
      codeDirectories: body.codeDirectories ?? current.codeDirectories,
      editor: body.editor ?? current.editor,
      gitGui: body.gitGui ?? current.gitGui,
      browser: body.browser ?? current.browser,
    };

    await saveConfig(updated);
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
