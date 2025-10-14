import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import Groups2Icon from '@mui/icons-material/Groups2';
import BuildIcon from '@mui/icons-material/Build';
import LanguageIcon from '@mui/icons-material/Language';
import ExtensionIcon from '@mui/icons-material/Extension';
import Person2Icon from '@mui/icons-material/Person2';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SettingsIcon from '@mui/icons-material/Settings';

export type IconByType = "doc" | "user" | "group" | "tools" | "settings" | "site" | "extension" | "myProfile" | "support";

export const RenderIconByType = (type: IconByType) => {
    switch (type) {
      case 'doc':
        return <AutoStoriesIcon />;
      case 'user':
        return <Person2Icon />;
      case 'group':
        return <Groups2Icon />;
      case 'tools':
        return <BuildIcon />;
      case 'settings':
        return <SettingsIcon />;
      case 'site':
        return <LanguageIcon />;
      case 'extension':
        return <ExtensionIcon />;
      case 'myProfile':
        return <Person2Icon />;
      case 'support':
        return <HelpOutlineIcon />;
      default:
        return <ExtensionIcon />;
    }
  }
  