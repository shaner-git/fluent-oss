export function escapeHeaderQuotedString(value: string): string {
  let escaped = '';

  for (const char of value) {
    switch (char) {
      case '\\':
        escaped += '\\\\';
        break;
      case '"':
        escaped += '\\"';
        break;
      case '\r':
        escaped += '\\r';
        break;
      case '\n':
        escaped += '\\n';
        break;
      case '\t':
        escaped += '\\t';
        break;
      default: {
        const codePoint = char.codePointAt(0);
        if (codePoint !== undefined && ((codePoint >= 0x00 && codePoint <= 0x1f) || codePoint === 0x7f)) {
          escaped += `\\u${codePoint.toString(16).padStart(4, '0')}`;
          break;
        }
        escaped += char;
      }
    }
  }

  return escaped;
}
