import React from 'react';
import { Select, SelectedItems } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { BranchDto } from '@veecode-platform/gitlab-pipelines-common';
import { gitlabPipelinesApiRef } from '../../api';
import { useEntityAnnotations } from '../../hooks/useEntityAnnotations';
import { useGitlabPipelinesContext } from '../../context';
import { OptionsProps } from './types';


export const SelectBranch = () => {
  
  const [branches, setBranches] = React.useState<BranchDto[]>([]);
  const [options, setOptions] = React.useState<OptionsProps[]>([]);
  const [branchDefault, setBranchDefault ] = React.useState<string>('');
  const { branch, setBranchState } = useGitlabPipelinesContext();
  const api = useApi(gitlabPipelinesApiRef);
  const { entity } = useEntity();
  const { entityRef } = useEntityAnnotations(entity);

  React.useEffect(() => {
    const getBranches = async () => {
      const data = await api.listBranches(entityRef);
      if (data) {
        setBranches(data);
        const defaultBranch = data.find(item => item.default);
        if (defaultBranch) setBranchDefault(defaultBranch.name);
      }
    };
    getBranches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, entityRef]);

  React.useEffect(()=>{
    setBranchState(branchDefault)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[branchDefault])

  React.useEffect(() => {
    if (branches) {
      const newOptions = branches.map((item) => {
        return {
          label: item.name,
          value: item.name,
        };
      });
      setOptions(newOptions);
    }
  }, [branches]);

  const handleSelectChange = (event: SelectedItems) => {
    const selectedValue = event;
    setBranchState(selectedValue as string); 
  };

  return (
        <Select
          onChange={handleSelectChange}
          label=""
          selected={branch ?? branchDefault}
          items={options}
        />
  );
};
