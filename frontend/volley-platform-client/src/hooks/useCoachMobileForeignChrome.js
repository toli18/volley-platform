import useMediaQuery from "../utils/useMediaQuery";
import useNavRoles from "../navigation/useNavRoles";
import { isCoachForeignChromePath } from "../navigation/coachMobileChrome";

export default function useCoachMobileForeignChrome(pathname, search = "") {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { isCoachUser } = useNavRoles();
  return isMobile && isCoachUser && isCoachForeignChromePath(pathname, search);
}
