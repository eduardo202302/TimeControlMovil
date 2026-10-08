/**
 * Compañías con las que se puede entrar desde el login. /login devuelve en
 * `user.schoolUsers` también los schoolUsers inactivos (`isActive === false`,
 * el flag del propio schoolUser, no el de la empresa): esos no se ofrecen ni
 * se usan. `isActive` ausente cuenta como activo.
 */

/** Mismo texto que ChooseCompany del webapp cuando no queda ninguna empresa. */
export const NO_ACTIVE_COMPANY_MESSAGE =
  "Usuario inactivo o no pertenece a una empresa por favor comuníquese con un administrador.";

export function filterActiveSchoolUsers<T extends { isActive?: boolean }>(
  schoolUsers: T[] | null | undefined,
): T[] {
  if (!Array.isArray(schoolUsers)) return [];
  return schoolUsers.filter((item) => !!item && item.isActive !== false);
}
