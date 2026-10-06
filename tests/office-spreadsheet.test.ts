import ExcelJS from 'exceljs';
import { OfficeProcessor } from '@/lib/file-processing/processors/office-processor';
import { FileProcessingOptions } from '@/lib/file-processing/types';
const options = FileProcessingOptions.parse({});
test('spreadsheet extraction preserves sheet names, row order and cell text', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Scope').addRows([['Task', 'Hours'], ['Review', 12]]);
  workbook.addWorksheet('Costs').addRow(['Budget', 1200]);
  const result = await new OfficeProcessor().extractText(Buffer.from(await workbook.xlsx.writeBuffer()), options);
  expect(result.success).toBe(true);
  expect(result.text).toContain('=== Scope ===\nTask\tHours\nReview\t12');
  expect(result.text).toContain('=== Costs ===\nBudget\t1200');
});
test('spreadsheet limit errors retain a failure instead of presenting truncated extraction', async () => {
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Scope').addRow(['a'.repeat(100)]);
  const result = await new OfficeProcessor().extractText(Buffer.from(await workbook.xlsx.writeBuffer()), { ...options, maxTextLength: 50 });
  expect(result.success).toBe(false); expect(result.error?.message).toContain('extraction limit');
});
test('CSV remains text with quoted values preserved', async () => {
  const result = await new OfficeProcessor().extractText(Buffer.from('Name,Value\n"A,B",12\n'), options);
  expect(result.success).toBe(true); expect(result.text).toContain('"A,B",12');
});
