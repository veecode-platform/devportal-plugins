import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CancelIcon from '@mui/icons-material/Cancel';
import PlayCircleFilled from '@mui/icons-material/PlayCircleFilled';
import ReportOffOutlined from '@mui/icons-material/ReportOffOutlined';

export const WarningIcon = () => (
  <ErrorIcon style={{ fontSize: '20', color: 'orange' }} />
);

export const RecordIcon = () => (
  <RadioButtonCheckedIcon style={{ fontSize: '20', color: '#cdcdcd' }} />
);

export const CheckOkIcon = () => (
  <CheckCircleIcon style={{ fontSize: '22', color: '#61AB5A' }} />
);

export const CancelIconOutline = () => (
  <CancelIcon style={{ fontSize: '20px', color: '#E2524B' }} />
);

export const PlayCircleIcon = () => (
  <PlayCircleFilled style={{ fontSize: '22px', color: '#cdcdcd' }} />
);

export const ReportOffIcon = () => (
  <ReportOffOutlined style={{ fontSize: '22px', color: '#cdcdcd' }} />
);

export const CircleChevronsRight = () => (
  <ChevronRightOutlined style={{ fontSize: '20', color: '#cdcdcd' }} />
);

export const CircleCloseOutline = () => (
  <HighlightOffIcon style={{ fontSize: '20', color: '#E2524B' }} />
);

export const ClockIcon = () => (
  <AccessTimeIcon style={{ fontSize: '22', color: '#eab308' }} />
);
