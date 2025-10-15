/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 * Adapted by Vertigo for VeeCode release.
 */
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AddCircle from '@mui/icons-material/AddCircleOutline';
import Bookmarks from '@mui/icons-material/BookmarksOutlined';
import Business from '@mui/icons-material/BusinessOutlined';
import Category from '@mui/icons-material/CategoryOutlined';
import Cloud from '@mui/icons-material/CloudOutlined';
import Extension from '@mui/icons-material/ExtensionOutlined';
import Favorite from '@mui/icons-material/Favorite';
import FolderOpen from '@mui/icons-material/FolderOpenOutlined';
import GppGood from '@mui/icons-material/GppGoodOutlined';
import AdminIcon from '@mui/icons-material/GppMaybeOutlined';
import Help from '@mui/icons-material/HelpOutline';
import Home from '@mui/icons-material/HomeOutlined';
import InsertChart from '@mui/icons-material/InsertChartOutlined';
import Layers from '@mui/icons-material/Layers';
import List from '@mui/icons-material/List';
import Logout from '@mui/icons-material/LogoutOutlined';
import ManageAccounts from '@mui/icons-material/ManageAccountsOutlined';
import MonitorHeart from '@mui/icons-material/MonitorHeartOutlined';
import Notifications from '@mui/icons-material/NotificationsOutlined';
import People from '@mui/icons-material/People';
import QueryStats from '@mui/icons-material/QueryStatsOutlined';
import Rule from '@mui/icons-material/RuleOutlined';
import School from '@mui/icons-material/SchoolOutlined';
import Star from '@mui/icons-material/Star';
import Storefront from '@mui/icons-material/StorefrontOutlined';
import Support from '@mui/icons-material/Support';
import Textsms from '@mui/icons-material/TextsmsOutlined';
import WavingHand from '@mui/icons-material/WavingHandOutlined';

const CommonIcons: {
  [k: string]: React.ComponentType<{}>;
} = {
  home: Home,
  group: People,
  category: Category,
  extension: Extension,
  school: School,
  add: AddCircle,
  list: List,
  layers: Layers,
  star: Star,
  favorite: Favorite,
  bookmarks: Bookmarks,
  queryStats: QueryStats,
  chart: InsertChart,
  business: Business,
  storefront: Storefront,
  folder: FolderOpen,
  cloud: Cloud,
  monitor: MonitorHeart,
  feedback: Textsms,
  validate: Rule,
  security: GppGood,
  help: Help,
  support: Support,
  quickstart: WavingHand,
  notifications: Notifications,
  manageAccounts: ManageAccounts,
  logout: Logout,
  account: AccountCircleOutlinedIcon,
  admin: AdminIcon,
};

export default CommonIcons;