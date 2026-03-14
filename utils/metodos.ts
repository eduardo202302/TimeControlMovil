import empresas from "../empresas.json";

export function buscarEmpresaPorPin(pin: string) {
  return empresas.empresas.find(
    (empresa: { pin: string }) => empresa.pin === pin,
  );
}
