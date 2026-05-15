import { FC, useState } from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { truncateString } from '../../../../utils/helpers';
import { WorkFlowActions } from '../../WorkFlowActions';
import SettingsIcon from '@mui/icons-material/Settings';
import { ModalComponent } from '../../../ModalComponent';
import { StatusWorkflowEnum } from '../../../../utils/enums/WorkflowListEnum';
import { WorkFlowItemProps } from './types';
import { WorkFlowStatus } from '../../WorkFlowStatus';
import { useGithuWorkflowsContext } from '../../../../context';
import { WorkflowAnnotation } from '../../../../utils/types';

export const WorkFlowItem: FC<WorkFlowItemProps> = (props) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const { entity, workflowsByAnnotation } = useGithuWorkflowsContext();
  const { id, status, conclusion, workflowName, parameters, lastRunId, path } = props;

  const workflow = (path && workflowsByAnnotation)
    ? workflowsByAnnotation.find((w: WorkflowAnnotation) => w.workflow && path.includes(w.workflow as string))
    : undefined;

  const handleShowModal = () => {
    setShowModal(!showModal);
  };

  const handleCICDLogs = (paramsId: string) => {
    const baseUrl = window.location.origin;
    const newUrl = `${baseUrl}/catalog/${entity.metadata.namespace}/${entity.kind.toLowerCase()}/${entity.metadata.name}/ci-cd/${paramsId}`;
    window.location.href = newUrl;
  };

  return (
    <>
      <Box
        sx={{
          padding: '.8rem 3rem',
          background: 'transparent',
          border: theme => `1px solid ${theme.palette.divider}`,
          borderRadius: '30px',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          color: 'text.primary',
          minWidth: '235px',
          minHeight: '56px',
        }}
      >
        <WorkFlowStatus
          status={status}
          conclusion={conclusion ? conclusion : ''}
          icon
        />

        <Tooltip title={workflow?.tooltip ?? workflowName} placement="top">
          <Typography
            onClick={() => handleCICDLogs(lastRunId as string)}
            sx={{ cursor: 'pointer' }}
          >
            {truncateString(workflow?.label ?? workflowName, 12)}
          </Typography>
        </Tooltip>

        <Box
          role="button"
          sx={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '.7rem',
          }}
        >
          {parameters &&
           parameters.length > 0 &&
           status !== StatusWorkflowEnum.queued && (
            <Tooltip title="Add Parameters" placement="top">
              <Box
                role="button"
                sx={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '.7rem',
                }}
                onClick={handleShowModal}
              >
                <SettingsIcon />
              </Box>
            </Tooltip>
          )}

          <WorkFlowActions
           status={status}
           conclusion={conclusion}
           workflowId={id}
           parameters={parameters}
            />
        </Box>
      </Box>

      {showModal && (
        <ModalComponent
          open={showModal}
          handleModal={handleShowModal}
          parameters={parameters ? parameters : []}
        />
      )}
    </>
  );
};
