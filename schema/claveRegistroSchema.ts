import z from "zod";

export const claveRegistroSchema = z.object({
  claveRegistro: z.string().min(6, "Por favor ingrese su clave de registro."),
});
