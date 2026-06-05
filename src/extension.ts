import * as vscode from "vscode";
import { getLastGeneratedSql, insertSqlToEditor, SqlGeneratorViewProvider } from "./SqlGeneratorViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SqlGeneratorViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SqlGeneratorViewProvider.viewId, provider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("cursor-sql-generator.open", async () => {
      await provider.reveal();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("cursor-sql-generator.insertSql", async () => {
      const sql = getLastGeneratedSql();
      if (!sql.trim()) {
        void vscode.window.showWarningMessage("没有可插入的 SQL，请先在侧边栏 SQL Generator 中生成。");
        return;
      }
      await insertSqlToEditor(sql);
    })
  );
}

export function deactivate(): void {}
