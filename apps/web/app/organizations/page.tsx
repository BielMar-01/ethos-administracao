import { requireSession } from "../../lib/auth-server";
import { OrganizationPicker } from "../../components/auth/organization-picker";
export default async function Organizations() {
  await requireSession();
  return <OrganizationPicker />;
}
