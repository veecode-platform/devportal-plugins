import { useState, useCallback } from 'react';
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
	totalCount: number;
	limit: number;
	offset: number;
};

type DenseTableProps = {
	teams: SoccerTeam[];
	totalCount: number;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onRowsPerPageChange: (rowsPerPage: number) => void;
};

export const DenseTable = ({
	teams,
	totalCount,
	page,
	pageSize,
	onPageChange,
	onRowsPerPageChange,
}: DenseTableProps) => {
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
			options={{
				search: false,
				paging: true,
				pageSize,
				pageSizeOptions: [5, 10, 25],
			}}
			columns={columns}
			data={data}
			page={page}
			totalCount={totalCount}
			onPageChange={onPageChange}
			onRowsPerPageChange={onRowsPerPageChange}
		/>
	);
};

export const DummyFetchComponent = () => {
	const discoveryApi = useApi(discoveryApiRef);
	const fetchApi = useApi(fetchApiRef);

	const [page, setPage] = useState(0);
	const [pageSize, setPageSize] = useState(5);

	const { value, loading, error } = useAsync(async (): Promise<SoccerTeamsResponse> => {
		const baseUrl = await discoveryApi.getBaseUrl('plugin-dummy-backend');
		const offset = page * pageSize;
		const url = `${baseUrl}/teams?limit=${pageSize}&offset=${offset}`;
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

		return (await response.json()) as SoccerTeamsResponse;
	}, [discoveryApi, fetchApi, page, pageSize]);

	const handlePageChange = useCallback((newPage: number) => {
		setPage(newPage);
	}, []);

	const handleRowsPerPageChange = useCallback((rowsPerPage: number) => {
		setPageSize(rowsPerPage);
		setPage(0);
	}, []);

	if (loading) {
		return <Progress />;
	} else if (error) {
		return <ResponseErrorPanel error={error} />;
	}

	return (
		<DenseTable
			teams={value?.teams ?? []}
			totalCount={value?.totalCount ?? 0}
			page={page}
			pageSize={pageSize}
			onPageChange={handlePageChange}
			onRowsPerPageChange={handleRowsPerPageChange}
		/>
	);
};
