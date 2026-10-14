/** Conservative supplement to the model's capability plan. A presentation
 * table is not an input dataset; semantic prioritization is not numeric data
 * processing. Ambiguous cases stay with the selected semantic/host owners.
 * This never removes an explicitly planned or user-selected script. */
export function needsImplicitCsvProcessor(inputs: string, operations: string) {
  // The goal may ask for CSV *output*. Only the confirmed input-source
  // dimension can establish a CSV source for this compiler-owned adapter.
  const source = inputs;
  if (!/\bcsv\b|逗号分隔/i.test(source)) return false;
  if (/(?:不需要|不用|不要|不提供|不接受|不是|非)\s*(?:任何)?\s*csv/i.test(source)) return false;
  const work = operations.replace(/(?:不需要|不用|不要|不做)[^，,；;。\n]{0,20}(?:计算|公式|求和|去重|排序)/g, "");
  return /计算|公式|求和|均值|平均值|百分比|数值统计|按(?:字段|列|日期|时间|数值).{0,12}排序|重复行.{0,8}去重|去重.{0,8}重复行|\b(?:sum|average|deduplicate)\b/i.test(work);
}
