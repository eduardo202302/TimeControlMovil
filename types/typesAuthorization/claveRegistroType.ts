import z from "zod";
import { claveRegistroSchema } from "../../schema/claveRegistroSchema";

export type ClaveRegistroType = z.infer<typeof claveRegistroSchema>;
