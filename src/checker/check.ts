import { resolve } from "node:path";
import { API, type Checker, type Type } from "typescript/unstable/sync";
import * as ast from "typescript/unstable/ast";

export type ProgramDiagnostic = {
  file: string;
  line: number;
  column: number;
  message: string;
};

/** A build-time boundary for JS operations proxies cannot intercept. Uses the pinned TS 7 API. */
export function checkNativePrograms(
  projectPath = "tsconfig.json",
  files?: readonly string[],
): ProgramDiagnostic[] {
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({
      openProjects: [resolve(projectPath)],
    });
    const project = snapshot.getProject(resolve(projectPath));
    if (!project)
      throw new Error("Could not load TypeScript project " + projectPath);
    const diagnostics: ProgramDiagnostic[] = [];
    const selected = files && new Set(files.map((file) => resolve(file)));
    for (const fileName of project.program.getSourceFileNames()) {
      if (
        selected
          ? !selected.has(resolve(fileName))
          : fileName.includes("/tests/fixtures/native-safety/")
      )
        continue;
      const file = project.program.getSourceFile(fileName);
      if (
        !file ||
        file.isDeclarationFile ||
        project.program.isSourceFileFromExternalLibrary(file)
      )
        continue;
      inspect(file, project.checker, diagnostics);
    }
    if (selected)
      for (const file of selected) {
        if (!project.program.getSourceFile(file))
          throw new Error("File is not in the TypeScript project: " + file);
      }
    snapshot.dispose();
    return diagnostics;
  } finally {
    api.close();
  }
}

function inspect(
  file: ast.SourceFile,
  checker: Checker,
  diagnostics: ProgramDiagnostic[],
): void {
  const seen = new Set<number>();
  const branded = (type: Type | undefined): boolean => {
    if (!type) return false;
    if (type.isUnionType()) return type.getTypes().some(branded);
    const constraint = checker.getBaseConstraintOfType(type);
    if (constraint && constraint.id !== type.id && branded(constraint))
      return true;
    return checker
      .getPropertiesOfType(type)
      .some((property) => property.name.includes("jevAnswerBrand"));
  };
  const expressionTypes = (expression: ast.Expression) => {
    const symbol = checker.getSymbolAtLocation(expression);
    return [
      checker.getTypeAtLocation(expression),
      symbol ? checker.getTypeOfSymbol(symbol) : undefined,
    ];
  };
  const isAnswer = (expression: ast.Expression): boolean =>
    expressionTypes(expression).some(branded) ||
    ((ast.isParenthesizedExpression(expression) ||
      ast.isNonNullExpression(expression)) &&
      isAnswer(expression.expression));
  const report = (expression: ast.Expression) => {
    if (!isAnswer(expression) || seen.has(expression.pos)) return;
    seen.add(expression.pos);
    const { line, character } = file.getLineAndCharacterOfPosition(
      expression.getStart(file),
    );
    diagnostics.push({
      file: file.fileName,
      line: line + 1,
      column: character + 1,
      message:
        "Whole Jev answers cannot be tested, coerced, or compared. Read .choice, .noul, or .score (or another answer field) first.",
    });
  };
  const booleanConstructor = (expression: ast.Expression) => {
    return expressionTypes(expression).some(
      (type) =>
        type &&
        [
          "BooleanConstructor",
          "NumberConstructor",
          "StringConstructor",
        ].includes(checker.typeToString(type)),
    );
  };
  const visit = (node: ast.Node): void => {
    if (
      ast.isIfStatement(node) ||
      ast.isWhileStatement(node) ||
      ast.isDoStatement(node)
    )
      report(node.expression);
    if (ast.isForStatement(node) && node.condition) report(node.condition);
    if (ast.isConditionalExpression(node)) report(node.condition);
    if (ast.isSwitchStatement(node)) report(node.expression);
    if (ast.isPrefixUnaryExpression(node)) report(node.operand);
    if (ast.isTypeOfExpression(node)) report(node.expression);
    if (ast.isTemplateExpression(node))
      for (const span of node.templateSpans) report(span.expression);
    if (
      ast.isBinaryExpression(node) &&
      node.operatorToken.kind !== ast.SyntaxKind.EqualsToken
    ) {
      // Even equality and nullish tests inspect the unresolved container itself.
      report(node.left);
      report(node.right);
    }
    if (ast.isCallExpression(node)) {
      if (booleanConstructor(node.expression))
        for (const argument of node.arguments) report(argument);
      // Array.filter(Boolean), .some(Boolean), and .every(Boolean) erase callback types.
      if (
        ast.isPropertyAccessExpression(node.expression) &&
        node.arguments.some(booleanConstructor)
      ) {
        const receiver = checker.getTypeAtLocation(node.expression.expression);
        const literal = node.expression.expression;
        if (
          (receiver &&
            checker
              .getIndexInfosOfType(receiver)
              .some((info) => branded(info.valueType))) ||
          (ast.isArrayLiteralExpression(literal) &&
            literal.elements.some(isAnswer))
        ) {
          const location = file.getLineAndCharacterOfPosition(
            node.getStart(file),
          );
          diagnostics.push({
            file: file.fileName,
            line: location.line + 1,
            column: location.character + 1,
            message:
              "Do not pass Boolean/Number/String as a callback over Jev answers; read each answer's semantic field.",
          });
        }
      }
    }
    if (ast.isAsExpression(node) || ast.isTypeAssertion(node)) {
      if (!branded(checker.getTypeAtLocation(node))) report(node.expression);
    }
    if (
      ast.isVariableDeclaration(node) &&
      ast.isIdentifier(node.name) &&
      node.type &&
      node.initializer &&
      !branded(checker.getTypeAtLocation(node.name))
    )
      report(node.initializer);
    node.forEachChild(visit);
  };
  visit(file);
}
