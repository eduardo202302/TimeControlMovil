export async function buscarEmpresaPorPin(pin: string) {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/eduardo202302/TimeControlMovil/refs/heads/main/data/empresas.json",
    );
    const empresas = await response.json();

    const empresaEncomntrada = empresas.empresas.find(
      (empresa: { pin: string }) => empresa.pin === pin,
    );

    return empresaEncomntrada;
  } catch (error) {
    console.error("Error al buscar empresa:", error);
    return null;
  }
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
