/**
 * Utility to export JSON data to CSV and trigger a browser download.
 */
export const exportToCSV = (data: any[], fileName: string) => {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const value = row[header] ?? '';
        const escaped = ('' + value).replace(/"/g, '""'); // Escape double quotes
        return `"${escaped}"`;
      }).join(',')
    )
  ];

  const csvContent = '\uFEFF' + csvRows.join('\n'); // Add BOM for Excel UTF-8 support
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
