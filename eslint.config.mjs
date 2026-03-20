import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".claude/", "dist/", ".next/", "scripts/"],
  },
  {
    // New React 19 rules — downgrade to warnings until pre-existing patterns are refactored
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
];

export default eslintConfig;
