/**
 * Marca literales numéricos crudos en las keys de tipografía/espaciado
 * dentro de StyleSheet.create(...) — deben pasar por scale()/verticalScale()/
 * font() de src/constants/responsive.ts, mismo patrón createStyles(scale,
 * verticalScale, font) ya aplicado en los archivos migrados (auditoría FASE
 * A/B, ver DrawerMenu.tsx como referencia).
 *
 * `width`/`height` quedan fuera a propósito: en el código ya migrado tienen
 * una tasa alta de excepciones legítimas (avatares, íconos, círculos
 * decorativos) que hoy son literales crudos documentados con un comentario,
 * no constantes nombradas — una regla que las cubriera generaría falsos
 * positivos en ~40 casos ya revisados. Ver auditoría B.4.
 */

const TARGET_KEYS = new Set([
  "fontSize",
  "padding",
  "paddingHorizontal",
  "paddingVertical",
  "margin",
  "marginHorizontal",
  "marginVertical",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "borderRadius",
  "gap",
]);

function isStyleSheetCreateCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "StyleSheet" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "create"
  );
}

function getKeyName(property) {
  if (property.key.type === "Identifier") return property.key.name;
  if (
    property.key.type === "Literal" &&
    typeof property.key.value === "string"
  ) {
    return property.key.value;
  }
  return null;
}

/**
 * true para `16` y también para `-9`/`+9` (UnaryExpression envolviendo un
 * Literal numérico) — los márgenes/paddings negativos son un patrón común
 * y no deben colarse sin marcar solo por el signo.
 */
function isRawNumericLiteral(value) {
  if (value.type === "Literal" && typeof value.value === "number") {
    return true;
  }
  if (
    value.type === "UnaryExpression" &&
    (value.operator === "-" || value.operator === "+") &&
    value.argument.type === "Literal" &&
    typeof value.argument.value === "number"
  ) {
    return true;
  }
  return false;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prohíbe literales numéricos crudos en keys de tipografía/espaciado dentro de StyleSheet.create — deben pasar por scale()/verticalScale()/font().",
    },
    schema: [],
    messages: {
      rawNumber:
        "Usa scale()/verticalScale()/font() de src/constants/responsive.ts en vez de un valor numérico crudo en '{{key}}'. Mismo patrón createStyles(scale, verticalScale, font) que el resto de los archivos migrados (ver DrawerMenu.tsx).",
    },
  },
  create(context) {
    function checkStyleObject(objectExpression) {
      for (const property of objectExpression.properties) {
        if (property.type !== "Property") continue;

        const keyName = getKeyName(property);
        if (!keyName || !TARGET_KEYS.has(keyName)) continue;

        if (isRawNumericLiteral(property.value)) {
          context.report({
            node: property.value,
            messageId: "rawNumber",
            data: { key: keyName },
          });
        }
      }
    }

    return {
      CallExpression(node) {
        if (!isStyleSheetCreateCall(node)) return;

        const [arg] = node.arguments;
        if (!arg || arg.type !== "ObjectExpression") return;

        // StyleSheet.create({ cardTitle: {...}, header: {...}, ... })
        for (const styleEntry of arg.properties) {
          if (styleEntry.type !== "Property") continue;
          if (styleEntry.value.type === "ObjectExpression") {
            checkStyleObject(styleEntry.value);
          }
        }
      },
    };
  },
};
