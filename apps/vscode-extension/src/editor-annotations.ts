/**
 * Editor Annotations — VS Code side.
 *
 * Registers the "Plannotator: Add Annotation" command, manages line
 * decorations, and POSTs captured selections to the plannotator server
 * through the cookie proxy.
 */

import * as vscode from "vscode";
import * as http from "http";

const annotationDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(255, 203, 107, 0.08)",
  isWholeLine: true,
  borderWidth: "0 0 0 3px",
  borderStyle: "solid",
  borderColor: "rgba(255, 203, 107, 0.5)",
  overviewRulerColor: "rgba(255, 203, 107, 0.6)",
  overviewRulerLane: vscode.OverviewRulerLane.Left,
});

/** Map of file URI string → decorated ranges */
const decoratedRanges = new Map<string, vscode.Range[]>();

let activeProxyPort: number | null = null;

export function setActiveProxyPort(port: number | null): void {
  activeProxyPort = port;
  if (port === null) {
    clearAllDecorations();
  }
}

export function registerEditorAnnotationCommand(
  context: vscode.ExtensionContext,
  log: vscode.LogOutputChannel,
): void {
  const command = vscode.commands.registerCommand(
    "plannotator-webview.addEditorAnnotation",
    async () => {
      if (activeProxyPort === null) {
        vscode.window.showInformationMessage(
          "No active Plannotator session. Open a plan review first.",
        );
        return;
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage(
          "Select text in the editor first.",
        );
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      const filePath = vscode.workspace.asRelativePath(
        editor.document.uri,
        false,
      );
      const lineStart = selection.start.line + 1; // 1-based
      const lineEnd = selection.end.line + 1;

      const comment = await vscode.window.showInputBox({
        prompt: "Add a comment (optional, press Enter to skip)",
        placeHolder: "Your comment...",
      });

      // undefined = user pressed Escape → cancel
      if (comment === undefined) return;

      try {
        const body = JSON.stringify({
          filePath,
          selectedText,
          lineStart,
          lineEnd,
          comment: comment || undefined,
        });

        await postToProxy(activeProxyPort, "/api/editor-annotation", body);

        // Add decoration
        const range = new vscode.Range(selection.start, selection.end);
        const uri = editor.document.uri.toString();
        const ranges = decoratedRanges.get(uri) ?? [];
        ranges.push(range);
        decoratedRanges.set(uri, ranges);
        refreshDecorations(editor);

        log.info(
          `[editor-annotation] added: ${filePath}:${lineStart}-${lineEnd}`,
        );
      } catch (err) {
        log.error(`[editor-annotation] failed: ${err}`);
        vscode.window.showErrorMessage(
          `Plannotator: Failed to add annotation`,
        );
      }
    },
  );

  context.subscriptions.push(command);

  // Refresh decorations when switching editor tabs
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) refreshDecorations(editor);
    }),
  );
}

function refreshDecorations(editor: vscode.TextEditor): void {
  const uri = editor.document.uri.toString();
  const ranges = decoratedRanges.get(uri) ?? [];
  editor.setDecorations(annotationDecoration, ranges);
}

function clearAllDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(annotationDecoration, []);
  }
  decoratedRanges.clear();
}

function postToProxy(
  port: number,
  path: string,
  body: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
