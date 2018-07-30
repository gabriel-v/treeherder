import React from 'react';
import PropTypes from 'prop-types';

import { thEvents } from '../../../../js/constants';
import { isReftest } from '../../../../helpers/job';
import { getBugUrl } from '../../../../helpers/url';

import ErrorsList from './ErrorsList';
import ListItem from './ListItem';
import SuggestionsListItem from './SuggestionsListItem';
import BugFiler from '../../BugFiler';

export default class FailureSummaryTab extends React.Component {
  constructor(props) {
    super(props);

    const { $injector } = this.props;
    this.$uibModal = $injector.get('$uibModal');
    this.$rootScope = $injector.get('$rootScope');

    this.state = {
      isBugFilerOpen: false,
    };
  }

  componentDidMount() {
    this.toggleBugFiler = this.toggleBugFiler.bind(this);
    this.bugFilerCallback = this.bugFilerCallback.bind(this);
  }

  fileBug(suggestion) {
    const { selectedJob, pinJob } = this.props;
    // const summary = suggestion.search;
    // const crashRegex = /application crashed \[@ (.+)\]$/g;
    // const crash = summary.match(crashRegex);
    // const crashSignatures = crash ? [crash[0].split('application crashed ')[1]] : [];
    // const allFailures = suggestions.map(sugg => (sugg.search.split(' | ')));

    pinJob(selectedJob);
    this.setState({
      isBugFilerOpen: true,
      suggestion,
    });

    // const modalInstance = this.$uibModal.open({
    //   template: intermittentTemplate,
    //   controller: 'BugFilerCtrl',
    //   size: 'lg',
    //   openedClass: 'filer-open',
    //   resolve: {
        // summary: () => (summary),
        // search_terms: () => (suggestion.search_terms),
        // fullLog: () => (jobLogUrls[0].url),
        // parsedLog: () => (logViewerFullUrl),
        // reftest: () => (isReftest(selectedJob) ? reftestUrl : ''),
        // selectedJob: () => (selectedJob),
        // allFailures: () => (allFailures),
        // crashSignatures: () => (crashSignatures),
        // successCallback: () => (data) => {
        //   // Auto-classify this failure now that the bug has been filed
        //   // and we have a bug number
        //   addBug({ id: data.success });
        //   this.$rootScope.$evalAsync(
        //     this.$rootScope.$emit(
        //       thEvents.saveClassification));
        //   // Open the newly filed bug in a new tab or window for further editing
        //   window.open(getBugUrl(data.success));
        // },
    //   },
    // });

    // modalInstance.opened.then(function () {
    //   window.setTimeout(() => modalInstance.initiate(), 0);
    // });
  }

  toggleBugFiler() {
    this.setState({ isBugFilerOpen: !this.state.isBugFilerOpen });
  }

  bugFilerCallback(data) {
    const { addBug } = this.props;

    addBug({ id: data.success });
    this.$rootScope.$evalAsync(this.$rootScope.$emit(thEvents.saveClassification));
    // Open the newly filed bug in a new tab or window for further editing
    window.open(getBugUrl(data.success));
  }

  render() {
    const {
      jobLogUrls, logParseStatus, suggestions, errors, logViewerFullUrl,
      bugSuggestionsLoading, selectedJob, addBug, reftestUrl,
    } = this.props;
    const { isBugFilerOpen, suggestion } = this.state;
    const logs = jobLogUrls;
    const jobLogsAllParsed = logs.every(jlu => (jlu.parse_status !== 'pending'));

    return (
      <div className="w-100 h-100">
        <ul className="list-unstyled failure-summary-list" ref={this.fsMount}>
          {suggestions.map((suggestion, index) =>
            (<SuggestionsListItem
              key={index}  // eslint-disable-line react/no-array-index-key
              index={index}
              suggestion={suggestion}
              toggleBugFiler={() => this.fileBug(suggestion)}
              selectedJob={selectedJob}
              addBug={addBug}
            />))}

          {!!errors.length &&
            <ErrorsList errors={errors} />}

          {!bugSuggestionsLoading && jobLogsAllParsed &&
            !logs.length && !suggestions.length && !errors.length &&
            <ListItem text="Failure summary is empty" />}

          {!bugSuggestionsLoading && jobLogsAllParsed && !!logs.length &&
            logParseStatus === 'success' &&
            <li>
              <p className="failure-summary-line-empty mb-0">Log parsing complete. Generating bug suggestions.<br />
                <span>The content of this panel will refresh in 5 seconds.</span></p>
            </li>}

          {!bugSuggestionsLoading && !jobLogsAllParsed &&
           logs.map(jobLog =>
             (<li key={jobLog.id}>
               <p className="failure-summary-line-empty mb-0">Log parsing in progress.<br />
                 <a
                   title="Open the raw log in a new window"
                   target="_blank"
                   rel="noopener"
                   href={jobLog.url}
                 >The raw log</a> is available. This panel will automatically recheck every 5 seconds.</p>
             </li>))}

          {!bugSuggestionsLoading && logParseStatus === 'failed' &&
            <ListItem text="Log parsing failed.  Unable to generate failure summary." />}

          {!bugSuggestionsLoading && !logs.length &&
            <ListItem text="No logs available for this job." />}

          {bugSuggestionsLoading &&
            <div className="overlay">
              <div>
                <span className="fa fa-spinner fa-pulse th-spinner-lg" />
              </div>
            </div>}
        </ul>
        {isBugFilerOpen && <BugFiler
          isOpen={isBugFilerOpen}
          toggle={this.toggleBugFiler}
          suggestion={suggestion}
          suggestions={suggestions}
          fullLog={jobLogUrls[0].url}
          parsedLog={logViewerFullUrl}
          reftestUrl={isReftest(selectedJob) ? reftestUrl : ''}
          successCallback={this.bugFilerCallback}
          jobGroupName={selectedJob.job_group_name}
        />}
      </div>
    );
  }
}

FailureSummaryTab.propTypes = {
  $injector: PropTypes.object.isRequired,
  addBug: PropTypes.func.isRequired,
  pinJob: PropTypes.func.isRequired,
  suggestions: PropTypes.array,
  selectedJob: PropTypes.object,
  errors: PropTypes.array,
  bugSuggestionsLoading: PropTypes.bool,
  jobLogUrls: PropTypes.array,
  logParseStatus: PropTypes.string,
  reftestUrl: PropTypes.string,
  logViewerFullUrl: PropTypes.string,
};

FailureSummaryTab.defaultProps = {
  suggestions: [],
  selectedJob: null,
  reftestUrl: null,
  errors: [],
  bugSuggestionsLoading: false,
  jobLogUrls: [],
  logParseStatus: 'pending',
  logViewerFullUrl: null,
};
