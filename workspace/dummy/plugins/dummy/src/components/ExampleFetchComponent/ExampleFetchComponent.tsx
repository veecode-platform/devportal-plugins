import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { discoveryApiRef, fetchApiRef, useApi } from '@backstage/core-plugin-api';

import useAsync from 'react-use/lib/useAsync';

type SoccerTeam = {
	id: string;
	name: string;
	country: string;
};

type SoccerTeamsResponse = {
	teams: SoccerTeam[];
};

type DenseTableProps = {
	teams: SoccerTeam[];
};

export const DenseTable = ({ teams }: DenseTableProps) => {
	const columns: TableColumn[] = [
		{ title: 'Team', field: 'name' },
		{ title: 'Country', field: 'country' },
	];

	const data = teams.map(team => ({
		name: team.name,
		country: team.country,
	}));

	return (
		<Table
			title="Soccer Teams (from backend plugin)"
			options={{ search: false, paging: false }}
			columns={columns}
			data={data}
		/>
	);
};

export const ExampleFetchComponent = () => {
	const discoveryApi = useApi(discoveryApiRef);
	const fetchApi = useApi(fetchApiRef);

	const { value, loading, error } = useAsync(async (): Promise<SoccerTeam[]> => {
		const baseUrl = await discoveryApi.getBaseUrl('plugin-dummy-backend');
		const url = `${baseUrl}/teams`;
		const response = await fetchApi.fetch(url);
		if (!response.ok) {
			throw new Error(
				`Request failed: ${response.status} ${response.statusText}`,
			);
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.includes('application/json')) {
			const bodyPreview = (await response.text()).slice(0, 200);
			throw new Error(
				`Expected JSON from ${url} but got ${contentType || 'unknown content-type'} (preview: ${JSON.stringify(bodyPreview)})`,
			);
		}

		const data = (await response.json()) as SoccerTeamsResponse;
		return data.teams;
	}, [discoveryApi, fetchApi]);

	if (loading) {
		return <Progress />;
	} else if (error) {
		return <ResponseErrorPanel error={error} />;
	}

	return <DenseTable teams={value ?? []} />;
};
