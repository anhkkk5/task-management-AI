// AI Service Utilities
export const repairTruncatedJson = (text: string): string => {
  const firstBrace = text.indexOf("{");
  if (firstBrace === -1) return text;

  let raw = text.slice(firstBrace);

  const openBraces = (raw.match(/{/g) || []).length;
  const closeBraces = (raw.match(/}/g) || []).length;
  const openBrackets = (raw.match(/\[/g) || []).length;
  const closeBrackets = (raw.match(/\]/g) || []).length;

  raw = raw.replace(/,\s*$/, "").replace(/,\s*([}\]])/g, "$1");

  const missingBrackets = openBrackets - closeBrackets;
  const missingBraces = openBraces - closeBraces;

  for (let i = 0; i < missingBrackets; i++) raw += "]";
  for (let i = 0; i < missingBraces; i++) raw += "}";

  return raw;
};

export const extractJson = (text: string): string => {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return text;
  }
  return text.slice(firstBrace, lastBrace + 1);
};
