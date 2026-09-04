import z from "zod";

export const registerSchema = z.object({
  fullName: z.string().trim().min(1, "El nombre es requerido"),
  nickName: z.string().trim().optional(),
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
  cedula: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => {
      if (!val) return true;
      const digits = val.replace(/\D/g, "");
      return digits.length === 11;
    }, "La cédula debe contener exactamente 11 números"),
});
