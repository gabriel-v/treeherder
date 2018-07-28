/* eslint-disable */
import React from 'react';
import PropTypes from 'prop-types';
import {
  Button, Modal, ModalHeader, ModalBody, ModalFooter, Tooltip, FormGroup, Input,
  Label,
} from 'reactstrap';

import { bzBaseUrl, dxrBaseUrl, hgBaseUrl } from '../../helpers/url';

const crashRegex = /application crashed \[@ (.+)\]$/g;
const omittedLeads = ['TEST-UNEXPECTED-FAIL', 'PROCESS-CRASH', 'TEST-UNEXPECTED-ERROR', 'REFTEST ERROR'];

export default class BugFiler extends React.Component {
  static getDerivedStateFromProps(props) {
    const { suggestions } = props;
    const allFailures = suggestions.map(sugg => (sugg.search.split(' | ')));
    let thisFailure = '';

    for (let i = 0; i < allFailures.length; i++) {
        for (let j = 0; j < omittedLeads.length; j++) {
            if (allFailures[i][0].search(omittedLeads[j]) >= 0 && allFailures[i].length > 1) {
                allFailures[i].shift();
            }
        }

        allFailures[i][0] = allFailures[i][0].replace('REFTEST TEST-UNEXPECTED-PASS', 'TEST-UNEXPECTED-PASS');

        if (i !== 0) {
            thisFailure += '\n';
        }
        thisFailure += allFailures[i].join(' | ');
    }
    // console.log('thisFailure', thisFailure);

    return { thisFailure };
  }

  constructor(props) {
    super(props);

    this.state = {
      summary: `Intermittent ${props.suggestion.search}`,
      parsedLog: null,
      productSearch: null,
      suggestedProducts: [],
      thisFailure: null,
      isFilerSummaryVisible: false,
      parsedSummary: null,
      possibleFilename: null,
      selectedProduct: null,
      isIntermittent: true,
      searching: false,
    };
  }

  componentDidMount() {
    this.cancelFiler = this.cancelFiler.bind(this);
    this.submitFiler = this.submitFiler.bind(this);
    this.findProduct = this.findProduct.bind(this);
  }

  getUnhelpfulSummaryReason(summary) {
    const { suggestion } = this.props;
    const searchTerms = suggestion.search_terms;

    if (searchTerms.length === 0) {
      return 'Selected failure does not contain any searchable terms.';
    }
    if (searchTerms.every(term => !summary.includes(term))) {
      return 'Summary does not include the full text of any of the selected failure\'s search terms:';
    }
    return '';
  }

  // Some job types are special, lets explicitly handle them.
  getSpecialProducts(fp) {
    const { jobGroupName } = this.props;
    const { suggestedProducts } = this.state;
    const newProducts = [];

    if (suggestedProducts.length === 0) {
      const jg = jobGroupName.toLowerCase();

      if (jg.includes('talos')) {
        newProducts.push('Testing :: Talos');
      }
      if (jg.includes('mochitest') && (fp.includes('webextensions/') || fp.includes('components/extensions'))) {
        newProducts.push('WebExtensions :: General');
      }
      if (jg.includes('mochitest') && fp.includes('webrtc/')) {
        newProducts.push('Core :: WebRTC');
      }
    }
    return newProducts;
  }

  cancelFiler() {
    this.props.toggle();
  }

  submitFiler() {
    const { toggle, successCallback } = this.props;

    successCallback();
    toggle();
  }

  /*
   *  Find the first thing in the summary line that looks like a filename.
   */
  findFilename(summary) {
    // Take left side of any reftest comparisons, as the right side is the reference file
    summary = summary.split('==')[0];
    // Take the leaf node of unix paths
    summary = summary.split('/').pop();
    // Take the leaf node of Windows paths
    summary = summary.split('\\').pop();
    // Remove leading/trailing whitespace
    summary = summary.trim();
    // If there's a space in what's remaining, take the first word
    summary = summary.split(' ')[0];
    return summary;
  }

  // Add a product/component pair to suggestedProducts
  addProduct(product) {
    const { suggestedProducts } = this.state;

    // Don't allow duplicates to be added to the list
    if (!suggestedProducts.includes(product)) {
      const newSuggestedProducts = [...suggestedProducts, product];

      this.setState({
        suggestedProducts: newSuggestedProducts,
        selectedProduct: newSuggestedProducts[0],
      });
    }
  }

  async findProduct() {
    const { jobGroupName } = this.props;
    const { productSearch, parsedSummary, suggestedProducts } = this.state;

    let possibleFilename = null;
    let suggestedProductsSet = new Set(suggestedProducts);

    this.setState({ searching: true });

    if (productSearch) {
      const resp = await fetch(`${bzBaseUrl}rest/prod_comp_search/${productSearch}?limit=5`)
      const data = await resp.json();
      console.log('data', data);
      // We can't file unless product and component are provided, this api can return just product. Cut those out.
      // for (let i = data.products.length - 1; i >= 0; i--) {
      //   if (!data.products[i].component) {
      //     data.products.splice(i, 1);
      //   }
      // }
      suggestedProductsSet = new Set([...suggestedProductsSet, data.products.map((prod) => (
        prod.product + (prod.component ? ` :: ${prod.component}` : '')
      ))]);
    } else {
      let failurePath = parsedSummary[0][0];

      // If the "TEST-UNEXPECTED-foo" isn't one of the omitted ones, use the next piece in the summary
      if (failurePath.includes('TEST-UNEXPECTED-')) {
        failurePath = parsedSummary[0][1];
        possibleFilename = this.findFilename(failurePath);
      }

      const lowerJobGroupName = jobGroupName.toLowerCase();
      // Try to fix up file paths for some job types.
      if (lowerJobGroupName.includes('spidermonkey')) {
        failurePath = 'js/src/tests/' + failurePath;
      }
      if (lowerJobGroupName.includes('videopuppeteer ')) {
        failurePath = failurePath.replace('FAIL ', '');
        failurePath = 'dom/media/test/external/external_media_tests/' + failurePath;
      }
      if (lowerJobGroupName.includes('web platform')) {
        failurePath = failurePath.startsWith('mozilla/tests') ?
          `testing/web-platform/${failurePath}` :
          `testing/web-platform/tests/${failurePath}`;
      }

      // Search mercurial's moz.build metadata to find products/components
      fetch(`${hgBaseUrl}mozilla-central/json-mozbuildinfo?p=${failurePath}`)
        .then(resp => resp.json().then((firstRequest) => {

          if (firstRequest.data.aggregate && firstRequest.data.aggregate.recommended_bug_component) {
            const suggested = firstRequest.data.aggregate.recommended_bug_component;
            suggestedProductsSet.add(`${suggested[0]} :: ${suggested[1]}`);
          }

          // Make an attempt to find the file path via a dxr file search
          if (suggestedProductsSet.size === 0 && possibleFilename.length > 4) {
            const dxrlink = `${dxrBaseUrl}mozilla-central/search?q=file:${possibleFilename}&redirect=false&limit=5`;
            // Bug 1358328 - We need to override headers here until DXR returns JSON with the default Accept header
            fetch(dxrlink, { headers: { Accept: 'application/json' } })
              .then((secondRequest) => {
                const results = secondRequest.data.results;
                let resultsCount = results.length;
                // If the search returns too many results, this probably isn't a good search term, so bail
                if (resultsCount === 0) {
                  suggestedProductsSet = new Set([...suggestedProductsSet, this.getSpecialProducts(failurePath)]);
                }
                results.forEach((result) => {
                  fetch(`${hgBaseUrl}mozilla-central/json-mozbuildinfo?p=${result.path}`)
                    .then((thirdRequest) => {
                      if (thirdRequest.data.aggregate && thirdRequest.data.aggregate.recommended_bug_component) {
                        const suggested = thirdRequest.data.aggregate.recommended_bug_component;
                        suggestedProductsSet.add(`${suggested[0]} :: ${suggested[1]}`);
                      }
                      // Only get rid of the throbber when all of these searches have completed
                      resultsCount -= 1;
                      if (resultsCount === 0) {
                        suggestedProductsSet = new Set([...suggestedProductsSet, this.getSpecialProducts(failurePath)]);
                      }
                    });
                });
              });
          } else {
            suggestedProductsSet = new Set([...suggestedProductsSet, this.getSpecialProducts(failurePath)]);
          }

        }));
    }
    const newSuggestedProducts = [...suggestedProductsSet];
    console.log('found these', newSuggestedProducts);
    this.setState({
      suggestedProducts: newSuggestedProducts,
      selectedProduct: newSuggestedProducts[0],
      searching: false,
    });
  }

  render() {
    const {
      isOpen, toggle, suggestion, parsedLog, fullLog, reftestUrl,
    } = this.props;
    const {
      productSearch, suggestedProducts, thisFailure, isFilerSummaryVisible,
      isIntermittent, summary, searching,
    } = this.state;
    const searchTerms = suggestion.search_terms;
    const crash = summary.match(crashRegex);
    const crashSignatures = crash ? [crash[0].split('application crashed ')[1]] : [];
    const unhelpfulSummaryReason = this.getUnhelpfulSummaryReason(summary);

    return (
      <div>
        <Modal isOpen={isOpen} toggle={toggle} size="lg">
          <ModalHeader toggle={toggle}>Intermittent Bug Filer</ModalHeader>
          <ModalBody>
            <form id="modalForm">
              <input
                name="modalProductFinderSearch"
                id="modalProductFinderSearch"
                onKeyDown={evt => this.setState({ productSearch: evt.target.value })}
                type="text"
                placeholder="Firefox"
                title="Manually search for a product"
              />
              <Button
                name="modalProductFinderButton"
                color="secondary"
                id="modalProductFinderButton"
                type="button"
                onClick={this.findProduct}
                prevent-default-on-left-click="true"
              >Find Product</Button>
              <div>
                {!!productSearch && searching && <div id="productSearchSpinner">
                  <span className="fa fa-spinner fa-pulse th-spinner-lg" />Searching {productSearch}
                </div>}
                <FormGroup check id="suggestedProducts">
                  {suggestedProducts.map((product, idx) => (<div key={`modalProductSuggestion${idx}`}>
                    <Label htmlFor={`modalProductSuggestion${idx}`}>{product}
                      <Input
                        type="radio"
                        value={product}
                        onChange={evt => this.setState({ selectedProduct: evt.target.value })}
                        name="productGroup"
                        id={`modalProductSuggestion${idx}`}
                      />
                    </Label>
                  </div>))}
                </FormGroup>
              </div>
              <div id="failureSummaryGroup" className="collapsed">
                {!!unhelpfulSummaryReason && <div id="unhelpfulSummaryReason">
                  <div>
                    <span
                      className="fa fa-info-circle"
                      id="unhelpful-summary-reason"
                    />Warning: {unhelpfulSummaryReason}
                    <Tooltip target="unhelpful-summary-reason">
                      This can cause poor bug suggestions to be generated
                    </Tooltip>
                  </div>
                  {searchTerms.map(term => <div>{term}</div>)}
                </div>}
                <label id="modalSummarylabel" htmlFor="summary">Summary:</label>
                <input
                  id="modalSummary"
                  type="text"
                  placeholder="Intermittent..."
                  pattern=".{0,255}"
                  onChange={evt => this.setState({ summary: evt.target.value })}
                  value={summary}
                />
                <span id="modalSummaryLength">{summary.length}</span>
                <i
                  onClick={() => this.setState({ isFilerSummaryVisible: !isFilerSummaryVisible })}
                  className={`fa fa-lg pointable ${isFilerSummaryVisible ? 'fa-chevron-circle-up' : 'fa-chevron-circle-down'}`}
                  id="toggle-failure-lines"
                >
                </i>
                <Tooltip target="toggle-failure-lines">
                  {isFilerSummaryVisible ? 'Show all failure lines for this job' : 'Hide all failure lines for this job'}
                </Tooltip>
                {isFilerSummaryVisible && <span>
                  <textarea id="modalFailureList" value={thisFailure} />
                </span>}
              </div>
              <div id="modalLogLinkCheckboxes">
                <div>
                  <label>
                    <input
                      id="modalParsedLog"
                      type="checkbox"
                      onChange={evt => this.setState({ isParsedLog: evt.target.value })}
                    />
                    <a target="_blank" rel="noopener" href={parsedLog}>Include Parsed Log Link</a>
                  </label>
                </div>
                <div>
                  <label>
                    <input
                      id="modalFullLog"
                      type="checkbox"
                      onChange={evt => this.setState({ isFullLog: evt.target.value })}
                    />
                    <a target="_blank" rel="noopener" href={fullLog}>Include Full Log Link</a>
                  </label>
                </div>
                {!!reftestUrl && <div><label id="modalReftestLogLabel">
                  <input
                    id="modalReftestLog"
                    type="checkbox"
                    onChange={evt => this.setState({ isReftest: evt.target.value })}
                  />
                  <a target="_blank" rel="noopener" href={reftestUrl}>Include Reftest Viewer Link</a>
                </label></div>}
              </div>
              <div id="modalCommentDiv">
                <label id="modalCommentlabel" htmlFor="modalComment">Comment:</label>
                <textarea
                  onChange={evt => this.setState({ comment: evt.target.value })}
                  id="modalComment"
                  type="textarea"
                  placeholder=""
                />
              </div>
              <div id="modalExtras">
                <label>
                  <input
                    id="modalIsIntermittent"
                    onChange={() => this.setState({ isIntermittent: !isIntermittent })}
                    type="checkbox"
                    checked={isIntermittent}
                  />
                  This is an intermittent failure
                </label>

                <div id="modalRelatedBugs">
                  <input
                    id="blocks-input"
                    type="text"
                    onChange={evt => this.setState({ blocks: evt.target.value })}
                    placeholder="Blocks"
                  />
                  <Tooltip target="blocks-input" placement="bottom">Comma-separated list of bugs</Tooltip>
                  <input
                    type="text"
                    id="depends-on"
                    onChange={evt => this.setState({ dependsOn: evt.target.value })}
                    placeholder="Depends on"
                  />
                  <Tooltip target="depends-on" placement="bottom">Comma-separated list of bugs</Tooltip>
                  <input
                    id="see-also"
                    type="text"
                    onChange={evt => this.setState({ seeAlso: evt.target.value })}
                    placeholder="See also"
                  />
                  <Tooltip target="see-also" placement="bottom">Comma-separated list of bugs</Tooltip>
                </div>

                {!!crashSignatures.length && <div id="modalCrashSignatureDiv">
                  <label
                    id="modalCrashSignatureLabel"
                    htmlFor="modalCrashSignature"
                  >Signature:</label>
                  <textarea
                    id="modalCrashSignature"
                    onChange={evt => this.setState({ crashSignatures: evt.target.value })}
                    maxLength="2048"
                  />
                </div>}
              </div>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={this.submitFiler}>Submit Bug</Button>{' '}
            <Button color="secondary" onClick={this.cancelFiler}>Cancel</Button>
          </ModalFooter>
        </Modal>
      </div>
    );
  }
}

BugFiler.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  toggle: PropTypes.func.isRequired,
  suggestion: PropTypes.object.isRequired,
  suggestions: PropTypes.array.isRequired,
  fullLog: PropTypes.string.isRequired,
  parsedLog: PropTypes.string.isRequired,
  reftestUrl: PropTypes.string.isRequired,
  successCallback: PropTypes.func.isRequired,
  jobGroupName: PropTypes.string.isRequired,
};
