import z from "zod";
import { registerSchema } from "../../schema/registerSchema";

export type RegisterType = z.infer<typeof registerSchema>;
