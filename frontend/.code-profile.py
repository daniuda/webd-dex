# Creating VS Code .code-profile file with specified settings for Claude Code and development preferences
import json
import os

# Define the settings dictionary
settings = {
  "claudeCode.apiBaseUrl": "http://localhost:11434/v1",
  "claudeCode.apiKey": "ollama",
  "claudeCode.model": "qwen2.5-coder:7b",
  "claudeCode.maxTokens": 4096,
  "claudeCode.temperature": 0.2,
  "claudeCode.stream": True,
  "editor.tabSize": 2,
  "editor.detectIndentation": False,
  "editor.formatOnSave": True,
  "editor.formatOnPaste": True,
  "editor.inlineSuggest.enabled": True,
  "editor.suggest.preview": True,
  "editor.minimap.enabled": False,
  "editor.renderWhitespace": "boundary",
  "editor.cursorSmoothCaretAnimation": "on",
  "editor.smoothScrolling": True,
  "files.autoSave": "onFocusChange",
  "files.trimTrailingWhitespace": True,
  "files.insertFinalNewline": True,
  "explorer.compactFolders": False,
  "explorer.confirmDelete": False,
  "terminal.integrated.defaultProfile.windows": "PowerShell",
  "terminal.integrated.smoothScrolling": True,
  "javascript.updateImportsOnFileMove.enabled": "always",
  "typescript.updateImportsOnFileMove.enabled": "always",
  "typescript.suggest.autoImports": True,
  "npm.enableRunFromFolder": True,
  "npm.scriptExplorerAction": "run",
  "vue.features.codeActions.enable": True,
  "vue.features.updateImportsOnFileMove.enable": True,
  "vue.format.enable": False,
  "python.analysis.typeCheckingMode": "basic",
  "python.formatting.provider": "black",
  "python.linting.enabled": True,
  "python.linting.pylintEnabled": True,
  "python.testing.pytestEnabled": True,
  "prettier.singleQuote": True,
  "prettier.trailingComma": "all",
  "prettier.semi": False,
  "prettier.printWidth": 100,
  "git.autofetch": True,
  "git.confirmSync": False,
  "git.enableSmartCommit": True,
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.iconTheme": "material-icon-theme",
  "workbench.editor.enablePreview": False,
  "telemetry.telemetryLevel": "off"
}

# Ensure output directory exists
output_path = "/mnt/data"
os.makedirs(output_path, exist_ok=True)

# Save the profile to a .code-profile file
profile_path = os.path.join(output_path, "claude_local_dev.code-profile")
with open(profile_path, "w", encoding="utf-8") as f:
    json.dump(settings, f, indent=2)

print(f"VS Code profile saved to {profile_path}")
