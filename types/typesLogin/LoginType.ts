import z from "zod";
import { LoginSchema } from "../../schema/LoginSchema";

export type LoginType = z.infer<typeof LoginSchema>;
