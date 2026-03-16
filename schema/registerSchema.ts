import z from "zod";

export const registerSchema = z.object({
  fullName: z.string().trim().min(1, "El nombre es requerido"),
  nickName: z.string().trim().min(1, "El nombre de usuario es requerido"),
  email: z
    .string()
    .trim()
    .email({
      pattern: /^\S+@\S+\.\S+$/,
      message: "El correo electrónico no es válido",
    }),
  phone: z.string().trim().min(7, "El teléfono es requerido"),
  password: z
    .string()
    .trim()
    .min(5, "La contraseña debe tener al menos 5 caracteres"),
  userType: z.number().min(1, "El tipo de usuario es requerido"),
  cedula: z.string().trim().min(1, "La cédula es requerida"),
});
