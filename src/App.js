// @flow
import * as React from 'react';
import {ButtonGroup, Col, Grid, Navbar, Panel, Row} from 'react-bootstrap';
import './App.css';
import {connect} from 'react-redux';
import {
  localUrlFromVersion,
  requestOngoingVersions,
  requestStatus,
  setVersion,
  submitVersion,
  updateUrl,
  updateVersionInput,
} from './actions.js';
import type {
  CheckResult,
  CheckResults,
  Dispatch,
  OngoingVersions,
  ReleaseInfo,
  State,
  Status,
} from './types.js';

function requestNotificationPermission(): void {
  if (
    Notification.permission !== 'denied' &&
    Notification.permission !== 'granted'
  ) {
    Notification.requestPermission();
  }
}

const parseUrl = (
  url: string,
): ?{service: string, product: string, version: string} => {
  const re = /^#(\w+)\/(\w+)\/([^/]+)\/?/; // Eg: #pollbot/firefox/50.0
  const parsed: ?(string[]) = url.match(re);
  if (!parsed) {
    return null;
  }
  const [_, service, product, version] = parsed;
  return {
    service: service,
    product: product,
    version: version,
  };
};

class ConnectedApp extends React.Component<{dispatch: Dispatch}, void> {
  refreshIntervalId: ?number;

  constructor(props: {dispatch: Dispatch}): void {
    super(props);
    this.refreshIntervalId = null;
  }

  componentDidMount(): void {
    this.props.dispatch(requestOngoingVersions());
    // Setup auto-refresh.
    this.refreshIntervalId = setInterval(
      () => this.props.dispatch(requestStatus()),
      60000,
    );
    // Setup notifications.
    requestNotificationPermission();
    // Listen to url hash changes.
    window.onhashchange = this.versionFromHash;
    // Check if we have a version in the url.
    this.versionFromHash();
  }

  componentWillUnmount(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId);
    }
  }

  versionFromHash = (): void => {
    const parsedUrl = parseUrl(window.location.hash);
    if (parsedUrl) {
      const version = parsedUrl.version;
      this.props.dispatch(setVersion(version));
      this.props.dispatch(requestStatus(version));
    }
  };

  render() {
    return (
      <Grid fluid>
        <Navbar collapseOnSelect fluid>
          <Navbar.Header>
            <Navbar.Brand>
              <a href=".">Delivery Dashboard</a>
            </Navbar.Brand>
          </Navbar.Header>
        </Navbar>
        <Row>
          <Col sm={9}>
            <VersionInput />
            <CurrentRelease />
          </Col>
          <Col sm={3} className="firefox-releases-menu">
            <Panel header={<strong>Firefox Releases</strong>}>
              <SideBar />
            </Panel>
          </Col>
        </Row>
      </Grid>
    );
  }
}
const App = connect()(ConnectedApp);

const VersionInput = connect(
  // mapStateToProps
  (state: State) => ({
    value: state.versionInput,
  }),
  // mapDispatchToProps
  (dispatch: Dispatch) => ({
    onSubmit: (e: SyntheticEvent<HTMLInputElement>): void => {
      e.preventDefault();
      dispatch(submitVersion());
      dispatch(updateUrl());
    },
    handleSearchBoxChange: (e: SyntheticEvent<HTMLInputElement>): void => {
      dispatch(updateVersionInput(e.currentTarget.value));
    },
    handleDismissSearchBoxVersion: (): void => {
      window.location.hash = '';
      dispatch(setVersion(''));
    },
  }),
)(SearchForm);

type SearchFormProps = {
  onSubmit: (e: SyntheticEvent<HTMLInputElement>) => void,
  handleSearchBoxChange: (e: SyntheticEvent<HTMLInputElement>) => void,
  handleDismissSearchBoxVersion: () => void,
  value: string,
};

function SearchForm({
  onSubmit,
  handleSearchBoxChange,
  handleDismissSearchBoxVersion,
  value,
}: SearchFormProps) {
  return (
    <form className="search-form well" onSubmit={onSubmit}>
      <ClearableTextInput
        onChange={handleSearchBoxChange}
        onClick={handleDismissSearchBoxVersion}
        value={value}
      />
    </form>
  );
}

type ClearableTextInputProps = {
  onChange: (e: SyntheticEvent<HTMLInputElement>) => void,
  onClick: () => void,
  value: string,
};

function ClearableTextInput({
  onChange,
  onClick,
  value,
}: ClearableTextInputProps) {
  return (
    <ButtonGroup className="clearable-text">
      <input
        className="form-control"
        onChange={onChange}
        placeholder={'Firefox version, eg. "57.0"'}
        type="search"
        value={value}
      />
      <span className="text-clear-btn" onClick={onClick}>
        <i className="glyphicon glyphicon-remove" />
      </span>
    </ButtonGroup>
  );
}

function Spinner() {
  return <div className="loader" />;
}

const SideBar = connect(
  // mapStateToProps
  (state: State) => ({
    versions: state.latestChannelVersions,
  }),
  // mapDispatchToProps
  null,
)(ReleasesMenu);

function ReleasesMenu({versions}: {versions: OngoingVersions}) {
  let releasesMenu = <Spinner />;
  if (versions) {
    const {nightly, beta, release, esr} = versions;
    releasesMenu = (
      <ul>
        <ReleaseItem title="Nightly" version={nightly} />
        <ReleaseItem title="Beta" version={beta} />
        <ReleaseItem title="Release" version={release} />
        <ReleaseItem title="ESR" version={esr} />
      </ul>
    );
  }
  return releasesMenu;
}

function ReleaseItem({title, version}: {title: string, version: string}) {
  return (
    <li key={title}>
      <a href={localUrlFromVersion(version)}>
        {title + ': ' + version}
      </a>
    </li>
  );
}

const CurrentRelease = connect(
  // mapStateToProps
  (state: State) => ({
    checkResults: state.checkResults,
    releaseInfo: state.releaseInfo,
    version: state.version,
  }),
  // mapDispatchToProps
  null,
)(Dashboard);

type DashboardPropType = {
  checkResults: CheckResults,
  releaseInfo: ?ReleaseInfo,
  version: string,
};

function Dashboard({releaseInfo, checkResults, version}: DashboardPropType) {
  if (version === '') {
    return (
      <p>
        Learn more about a specific version.
        <strong> Select or enter your version number.</strong>
      </p>
    );
  } else {
    return (
      <div>
        <h2>
          Channel: {(releaseInfo && releaseInfo.channel) || ''}
        </h2>
        <div className="dashboard">
          {Object.keys(checkResults).map(key =>
            DisplayCheckResult(key, checkResults[key]),
          )}
        </div>
      </div>
    );
  }
}

function DisplayCheckResult(title: string, checkResult: CheckResult) {
  return (
    <div className="panel panel-default" key={title}>
      <div className="panel-body">
        <h2>
          {title}
        </h2>
        <DisplayStatus
          status={checkResult.status}
          message={checkResult.message}
          url={checkResult.link}
        />
      </div>
    </div>
  );
}

function DisplayStatus({
  status,
  message,
  url,
}: {
  status: Status,
  message: string,
  url: string,
}) {
  const statusToLabelClass = {
    error: 'label-warning',
    exists: 'label-success',
    incomplete: 'label-info',
    missing: 'label-danger',
  };
  const labelText = status === 'error' ? 'Error: ' + message : status;
  return (
    <a
      className={'label ' + statusToLabelClass[status]}
      title={message}
      href={url}
    >
      {labelText}
    </a>
  );
}

export default App;
