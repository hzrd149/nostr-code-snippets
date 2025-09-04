export function formatSnippetForDisplay(snippet: any): string {
  const lines = [
    `📝 ${snippet.title || "Untitled"}`,
    `🏷️  ${snippet.tags?.join(", ") || "No tags"}`,
    `📅 ${new Date(snippet.createdAt).toLocaleDateString()}`,
    `👤 ${snippet.author || "Unknown"}`,
    "",
  ];

  if (snippet.language) {
    lines.push(`Language: ${snippet.language}`);
  }

  lines.push("```");
  lines.push(
    snippet.content.substring(0, 200) +
      (snippet.content.length > 200 ? "..." : ""),
  );
  lines.push("```");

  return lines.join("\n");
}
