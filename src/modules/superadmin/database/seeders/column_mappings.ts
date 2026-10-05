import { db } from "@/framework/facade.js";
import { columnMappings } from "@/modules/superadmin/database/models/column_mappings.js";

export const table = columnMappings;

export default async function ColumnMappingsSeeder() {
  const rows = [
    { dbColumn: "office", label: "office", excelHeader: "Office", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "be_no", label: "be_no", excelHeader: "BE_NO", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "be_date", label: "be_date", excelHeader: "BE_DATE", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "hs_code", label: "hs_code", excelHeader: "HSCode", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "item_name", label: "item_name", excelHeader: "", isCalculated: false, isFromDb: true, isRegexExtracted: false },
    { dbColumn: "lc_number", label: "lc_number", excelHeader: "LC Number", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "net_wt", label: "net_wt", excelHeader: "Net_WT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "excess_qty", label: "excess_qty", excelHeader: "Description", isCalculated: false, isFromDb: false, isRegexExtracted: true },
    { dbColumn: "total_qty", label: "total_qty", excelHeader: "", isCalculated: true, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "ass_value", label: "ass_value", excelHeader: "Ass. Value", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "cd", label: "cd", excelHeader: "CD", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "rd", label: "rd", excelHeader: "RD", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "sd", label: "sd", excelHeader: "SD", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "base_value_of_vat", label: "base_value_of_vat", excelHeader: "", isCalculated: true, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "vat", label: "vat", excelHeader: "VAT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "unit_value", label: "unit_value", excelHeader: "", isCalculated: true, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "at", label: "at", excelHeader: "AT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
    { dbColumn: "bin", label: "bin", excelHeader: "BIN", isCalculated: false, isFromDb: false, isRegexExtracted: false }
  ];

  for (const row of rows) {
    // Idempotent: never overwrite mappings a superadmin has already edited.
    await db.insert(columnMappings).values(row).onConflictDoNothing({ target: columnMappings.dbColumn });
  }

  console.log("ColumnMappings seeder completed");
}
