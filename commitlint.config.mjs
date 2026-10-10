/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Match existing history: `feat:`, `fix(billing):`, `docs:`, …
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 200],
    "footer-max-line-length": [1, "always", 200],
  },
};

export default config;
