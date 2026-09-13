export function formatCaseId(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("La secuencia del caso debe ser positiva.");
  }
  return `CB-${sequence.toString().padStart(6, "0")}`;
}
