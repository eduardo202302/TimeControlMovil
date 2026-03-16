import empresas from "../empresas.json";

export function buscarEmpresaPorPin(pin: string) {
  return empresas.empresas.find(
    (empresa: { pin: string }) => empresa.pin === pin,
  );
}

export const formatPhone = (value: string) => {
  const cleaned = value.replace(/\D/g, "").slice(0, 10);
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 6)
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
};

export const formatCedula = (value: string) => {
  const cleaned = value.replace(/\D/g, "").slice(0, 11);
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 9)}-${cleaned.slice(9)}`;
};
