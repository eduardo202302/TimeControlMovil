import axios from "axios";

interface Role {
  id: number;
  name: string;
  permissions: Record<string, unknown>;
  menu: number[];
}

interface RolesResponse {
  success: boolean;
  data: {
    items: Role[];
    count: number;
  };
}

export async function getRoleById(
  urlColegio: string,
  token: string,
  roleId: number,
): Promise<Role | null> {
  try {
    const response = await axios.get<RolesResponse>(`${urlColegio}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(
      "getRoleById response:",
      JSON.stringify(response.data, null, 2),
    );

    if (response.data.success) {
      const role = response.data.data.items.find((r) => r.id === roleId);
      return role ?? null;
    }

    return null;
  } catch (error) {
    console.error("getRoleById error:", error);
    return null;
  }
}
