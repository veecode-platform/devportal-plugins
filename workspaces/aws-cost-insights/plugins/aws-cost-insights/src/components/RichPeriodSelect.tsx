import React, { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputAdornment,
  Tooltip,
} from '@material-ui/core';
import DateRangeIcon from '@material-ui/icons/DateRange';
import EventIcon from '@material-ui/icons/Event';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { costInsightsTranslationRef } from '../translations';

export interface RichPeriodSelectProps {
  initialPreset?: string;
  onPeriodChange: (intervals: string, displayLabel: string) => void;
}

export const RichPeriodSelect: React.FC<RichPeriodSelectProps> = ({
  initialPreset = 'P90D',
  onPeriodChange,
}) => {
  const { t } = useTranslationRef(costInsightsTranslationRef);

  const [selectedPreset, setSelectedPreset] = useState<string>(initialPreset);
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const ninetyDaysAgoStr = new Date(Date.now() - 90 * 86400000)
    .toISOString()
    .split('T')[0];

  const [startDate, setStartDate] = useState(ninetyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  const handlePresetSelect = (value: string) => {
    if (value === 'CUSTOM') {
      setDialogOpen(true);
      return;
    }

    setSelectedPreset(value);
    setCustomLabel(null);

    const today = new Date().toISOString().split('T')[0];
    let intervals = `R90/P1D/${today}`;
    let label = t('periodSelect.past90Days');

    if (value === 'P30D') {
      intervals = `R30/P1D/${today}`;
      label = t('periodSelect.past30Days');
    } else if (value === 'P60D') {
      intervals = `R60/P1D/${today}`;
      label = t('periodSelect.past60Days');
    } else if (value === 'P90D') {
      intervals = `R90/P1D/${today}`;
      label = t('periodSelect.past90Days');
    } else if (value === 'P180D') {
      intervals = `R180/P1D/${today}`;
      label = t('periodSelect.past180Days');
    }

    onPeriodChange(intervals, label);
  };

  const handleApplyCustom = () => {
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      alert('Start date must be before end date.');
      return;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const intervals = `R${diffDays}/P1D/${endDate}`;
    const label = `${startDate} ~ ${endDate} (${diffDays}d)`;

    setSelectedPreset('CUSTOM');
    setCustomLabel(label);
    setDialogOpen(false);
    onPeriodChange(intervals, label);
  };

  return (
    <Box display="flex" alignItems="center">
      <FormControl variant="outlined" size="small">
        <Select
          value={selectedPreset}
          onChange={e => handlePresetSelect(e.target.value as string)}
          startAdornment={
            <InputAdornment position="start">
              <DateRangeIcon fontSize="small" color="action" />
            </InputAdornment>
          }
        >
          <MenuItem value="P30D">{t('periodSelect.past30Days')}</MenuItem>
          <MenuItem value="P60D">{t('periodSelect.past60Days')}</MenuItem>
          <MenuItem value="P90D">{t('periodSelect.past90Days')}</MenuItem>
          <MenuItem value="P180D">{t('periodSelect.past180Days')}</MenuItem>
          <MenuItem value="CUSTOM">
            {customLabel ? customLabel : t('periodSelect.customRange')}
          </MenuItem>
        </Select>
      </FormControl>

      <Tooltip title={t('periodSelect.customTitle')}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setDialogOpen(true)}
          style={{ marginLeft: 8, minWidth: 40, padding: '6px 8px' }}
        >
          <EventIcon fontSize="small" />
        </Button>
      </Tooltip>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('periodSelect.customTitle')}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" style={{ gap: 16 }} pt={1}>
            <TextField
              label={t('periodSelect.startDate')}
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              variant="outlined"
              size="small"
              fullWidth
            />
            <TextField
              label={t('periodSelect.endDate')}
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              variant="outlined"
              size="small"
              fullWidth
              inputProps={{ max: todayStr }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} color="default">
            {t('periodSelect.cancel')}
          </Button>
          <Button
            onClick={handleApplyCustom}
            color="primary"
            variant="contained"
          >
            {t('periodSelect.apply')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
