import React from 'react';
import fsExtra from 'fs-extra';
import { fireEvent, wait, waitForElement } from '@testing-library/dom';
import { createMemoryHistory } from 'history';
import { Status } from 'shared/types';
import { initChartFromNetwork } from 'utils/chart';
import {
  getNetwork,
  injections,
  lightningServiceMock,
  renderWithProviders,
  suppressConsoleErrors,
} from 'utils/tests';
import NetworkView from './NetworkView';

const fsMock = fsExtra as jest.Mocked<typeof fsExtra>;
const bitcoindServiceMock = injections.bitcoindService as jest.Mocked<
  typeof injections.bitcoindService
>;
const dockerServiceMock = injections.dockerService as jest.Mocked<
  typeof injections.dockerService
>;

describe('NetworkView Component', () => {
  const renderComponent = (
    id: string | undefined,
    status?: Status,
    images?: string[],
  ) => {
    const network = getNetwork(1, 'test network', status);
    const initialState = {
      app: {
        dockerImages: images || [],
      },
      network: {
        networks: [network],
      },
      designer: {
        allCharts: {
          1: initChartFromNetwork(network),
        },
      },
    };
    const route = `/network/${id}`;
    const history = createMemoryHistory({ initialEntries: [route] });
    const location = { pathname: route, search: '', hash: '', state: undefined };
    const match = { params: { id }, isExact: true, path: '', url: route };
    const cmp = <NetworkView history={history} location={location} match={match} />;
    const result = renderWithProviders(cmp, { initialState, route });
    return {
      ...result,
      network,
      primaryBtn: result.container.querySelector(
        '.ant-page-header-heading-extra .ant-btn',
      ) as Element,
    };
  };

  beforeEach(() => {
    lightningServiceMock.waitUntilOnline.mockResolvedValue();
    bitcoindServiceMock.waitUntilOnline.mockResolvedValue();
    dockerServiceMock.getImages.mockResolvedValue([]);
  });

  it('should not render if the network is not found', () => {
    const { queryByText } = renderComponent('99');
    expect(queryByText('test network')).toBeNull();
  });

  it('should not render if the network id is not provided', () => {
    const { queryByText } = renderComponent(undefined);
    expect(queryByText('test network')).toBeNull();
  });

  it('should render the name', () => {
    const { getByText } = renderComponent('1');
    expect(getByText('test network')).toBeInTheDocument();
  });

  it('should navigate home when back button clicked', () => {
    const { getByLabelText, history } = renderComponent('1');
    const backBtn = getByLabelText('Back');
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(history.location.pathname).toEqual('/');
  });

  it('should render an error if necessary', async () => {
    const errorMsg = 'failed to start';
    // mock dockerService.start to throw an error
    const mockDockerStart = injections.dockerService.start as jest.Mock;
    mockDockerStart.mockRejectedValueOnce(new Error(errorMsg));
    const { getByText, findByText } = renderComponent('1');
    fireEvent.click(getByText('Start'));
    expect(await findByText(errorMsg)).toBeInTheDocument();
  });

  it('should change UI when network is started', async () => {
    const { primaryBtn } = renderComponent('1');
    expect(primaryBtn).toHaveTextContent('Start');
    fireEvent.click(primaryBtn);
    // should switch to stopping immediately
    expect(primaryBtn).toHaveTextContent('Starting');
    // should change to stopped after some time
    await wait(() => {
      expect(primaryBtn).toHaveTextContent('Stop');
    });
  });

  it('should change UI when network is stopped', async () => {
    const { primaryBtn } = renderComponent('1', Status.Started);
    expect(primaryBtn).toHaveTextContent('Stop');
    fireEvent.click(primaryBtn);
    // should switch to stopping immediately
    expect(primaryBtn).toHaveTextContent('Stopping');
    // should change to stopped after some time
    await wait(() => {
      expect(primaryBtn).toHaveTextContent('Start');
    });
  });

  it('should do nothing when network is starting', async () => {
    const { primaryBtn } = renderComponent('1', Status.Starting);
    expect(primaryBtn).toHaveTextContent('Starting');
    fireEvent.click(primaryBtn);
    // should remain the same since button should be disabled
    expect(primaryBtn).toHaveTextContent('Starting');
  });

  it('should display a message if the docker images are not downloaded', async () => {
    const { getByText } = renderComponent('1');
    expect(
      getByText(
        'Starting this network will take a bit longer than normal because it uses docker images that have not been downloaded yet.',
      ),
    ).toBeInTheDocument();
  });

  it('should not display a message if the docker images are found', async () => {
    const images = ['bitcoind:0.19.0.1', 'lnd:0.8.2-beta', 'clightning:0.8.0'];
    const { queryByText } = renderComponent('1', Status.Stopped, images);
    expect(
      queryByText(
        'Starting this network will take a bit longer than normal because it uses docker images that have not been downloaded yet.',
      ),
    ).toBeNull();
  });

  describe('rename network', () => {
    beforeEach(jest.useFakeTimers);
    afterEach(jest.useRealTimers);

    it('should show the rename input', async () => {
      const { getByLabelText, getByText, findByDisplayValue } = renderComponent('1');
      fireEvent.mouseOver(getByLabelText('more'));
      await wait(() => jest.runOnlyPendingTimers());
      fireEvent.click(getByText('Rename'));
      const input = (await findByDisplayValue('test network')) as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.type).toBe('text');
      fireEvent.click(getByText('Cancel'));
      expect(input).not.toBeInTheDocument();
      expect(getByText('Start')).toBeInTheDocument();
    });

    it('should rename the network', async () => {
      const { getByLabelText, getByText, findByDisplayValue, store } = renderComponent(
        '1',
      );
      fireEvent.mouseOver(getByLabelText('more'));
      await wait(() => jest.runOnlyPendingTimers());
      fireEvent.click(getByText('Rename'));
      const input = await findByDisplayValue('test network');
      fireEvent.change(input, { target: { value: 'new network name' } });
      fireEvent.click(getByText('Save'));
      await wait(() => jest.runOnlyPendingTimers());
      expect(store.getState().network.networkById(1).name).toBe('new network name');
    });

    it('should display an error if renaming fails', async () => {
      const { getByLabelText, getByText, findByDisplayValue } = renderComponent('1');
      fireEvent.mouseOver(getByLabelText('more'));
      await wait(() => jest.runOnlyPendingTimers());
      fireEvent.click(getByText('Rename'));
      const input = await findByDisplayValue('test network');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.click(getByText('Save'));
      await wait(() => jest.runOnlyPendingTimers());
      expect(getByText('Failed to rename the network')).toBeInTheDocument();
    });
  });

  describe('delete network', () => {
    it('should show the confirm modal', async () => {
      const { getByLabelText, getByText, findByText } = renderComponent('1');
      fireEvent.mouseOver(getByLabelText('more'));
      fireEvent.click(await findByText('Delete'));
      expect(
        getByText('Are you sure you want to delete this network?'),
      ).toBeInTheDocument();
      expect(getByText('Yes')).toBeInTheDocument();
      expect(getByText('Cancel')).toBeInTheDocument();
    });

    it('should delete the network', async () => {
      const { getByLabelText, getByText, findByText, network } = renderComponent(
        '1',
        Status.Started,
      );
      fireEvent.mouseOver(getByLabelText('more'));
      fireEvent.click(await findByText('Delete'));
      fireEvent.click(await findByText('Yes'));
      // wait for the error notification to be displayed
      await waitForElement(() => getByLabelText('check-circle'));
      expect(
        getByText("The network 'test network' and its data has been deleted!"),
      ).toBeInTheDocument();
      expect(fsMock.remove).toBeCalledWith(expect.stringContaining(network.path));
    });

    it('should display an error if the delete fails', async () => {
      // antd Modal.confirm logs a console error when onOk fails
      // this suppresses those errors from being displayed in test runs
      await suppressConsoleErrors(async () => {
        fsMock.remove = jest.fn().mockRejectedValue(new Error('cannot delete'));
        const { getByLabelText, getByText, findByText, store } = renderComponent('1');
        fireEvent.mouseOver(getByLabelText('more'));
        fireEvent.click(await findByText('Delete'));
        fireEvent.click(await findByText('Yes'));
        // wait for the error notification to be displayed
        await waitForElement(() => getByLabelText('close-circle'));
        expect(getByText('cannot delete')).toBeInTheDocument();
        expect(store.getState().network.networks).toHaveLength(1);
        expect(store.getState().designer.allCharts[1]).toBeDefined();
      });
    });
  });
});
