/**
 * Export data to CSV file
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string = "export.csv",
  columns?: { key: keyof T; label: string }[]
) {
  if (data.length === 0) {
    console.warn("No data to export");
    return;
  }

  // If columns are provided, use them; otherwise use all keys from first row
  const headers = columns
    ? columns.map((col) => col.label)
    : Object.keys(data[0]);

  // Create CSV content
  const csvContent = [
    // Headers
    headers.join(","),
    // Rows
    ...data.map((row) => {
      const values = columns
        ? columns.map((col) => {
            const value = row[col.key];
            // Handle arrays, objects, and special characters
            if (Array.isArray(value)) {
              return `"${value.join("; ")}"`;
            }
            if (typeof value === "object" && value !== null) {
              return `"${JSON.stringify(value)}"`;
            }
            // Escape quotes and wrap in quotes if contains comma
            const stringValue = String(value || "");
            if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          })
        : headers.map((header) => {
            const value = row[header];
            if (Array.isArray(value)) {
              return `"${value.join("; ")}"`;
            }
            if (typeof value === "object" && value !== null) {
              return `"${JSON.stringify(value)}"`;
            }
            const stringValue = String(value || "");
            if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          });
      return values.join(",");
    }),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

