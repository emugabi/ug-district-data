const XLSX = require("xlsx");
const _ = require("lodash");
const axios = require("axios");
require("axios-debug-log");
const events = require("events");
const eventEmitter = new events.EventEmitter();
const rateLimit = require("axios-rate-limit");

const http = rateLimit(axios.create(), {
  maxRequests: 5,
  perMilliseconds: 1000,
  //maxRPS: 10
});

const baseUrl = "https://xx.xx.ug"; //Figure it out

/**
 * Datastore
 */
let data = {
  districts: [],
  constituencies: [],
  subcounties: [],
  parishes: [],
  errors: [],
};

/**
 * Get districts
 * @returns {Promise} Axios
 *
 */
function makeDistrictApiCall() {
  return http.get(`${baseUrl}/api/districts/`);
}

/**
 * Get districts
 * @returns {Promise} Axios
 *
 */
function makeConstituencyApiCall(districtId) {
  return http.get(`${baseUrl}/api/eas/${districtId}`);
}

/**
 * Get sub-counties
 * @returns {Promise} Axios
 *
 */
function makeSubCountiesApiCall(constituencyId) {
  return http.get(`${baseUrl}/api/scs/${constituencyId}`);
}

/**
 * Get parishes
 * @returns {Promise} Axios
 *
 */
function makeParishesApiCall(constituencyId) {
  return http.get(`${baseUrl}/api/parishes/${constituencyId}`);
}

function getConstituencies(districts) {
  let constituencyRequests = [];

  for (const district of districts) {
    constituencyRequests.push(makeConstituencyApiCall(district.id));
  }

  axios
    .all(constituencyRequests)
    .then(
      axios.spread((...responses) => {
        responses.forEach((constituencyResponse) => {
          _.each(constituencyResponse.data, function (constituency) {
            data.constituencies.push(constituency);
          });
        });

        console.log(`================================================`);
        console.log(`added ${data.constituencies.length} constituencies`);
        console.log(`================================================`);

        writeToExcel(data.constituencies, "constituencies");

        // Fire event
        eventEmitter.emit("get-subcounties", data.constituencies);
      })
    )
    .catch((errors) => {
      // react on errors.
      console.error(errors.message);
      data.errors.push(errors);
    });
}

function getSubcounties(constituencies) {
  let subCountyRequests = [];

  for (const constituency of constituencies) {
    subCountyRequests.push(makeSubCountiesApiCall(constituency["ID"]));
  }

  axios
    .all(subCountyRequests)
    .then(
      axios.spread((...responses) => {
        responses.forEach((subCountryResponse) => {
          _.each(subCountryResponse.data, function (sub_counties) {
            data.subcounties.push(sub_counties);
          });
        });

        console.log(`================================================`);
        console.log(`added ${data.subcounties.length} sub counties`);
        console.log(`================================================`);

        writeToExcel(data.subcounties, "subcounties");

        // Fire event
        eventEmitter.emit("get-parishes", data.subcounties);
      })
    )
    .catch((error) => {
      // react on errors.
      console.error(error.message);
      data.errors.push(error);
      next(error);
    });
}

async function getParishes(subcounties) {
  for (const subcounty of subcounties) {
    try {
      makeParishesApiCall(subcounty.id).then((parishResponse) => {
        _.each(parishResponse.data, function (parish) {
          parish.subcountry_id = subcounty.id;
          data.parishes.push(parish);
        });
      });
    } catch (err) {
      data.parishes.push({
        subcounty_id: subcounty.id,
        message: err.message,
      });
      data.errors.push(err.message);
    }
  }

  do {
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`================================================`);
    console.log(`${data.parishes.length} of ${subcounties.length}`);
    console.log(`================================================`);
  } while (subcounties.length > data.parishes.length);

  console.log(`================================================`);
  console.log(`added ${data.parishes.length} parishes`);
  console.log(`================================================`);

  writeToExcel(data.parishes, "parishes");
  // Fire event
  eventEmitter.emit("completed");
}

function writeToExcel(dataArray, fileName) {
  console.log("Skipping writing to excel");
  // var ws = XLSX.utils.json_to_sheet(dataArray);

  // var wb2 = XLSX.utils.book_new();
  // XLSX.utils.book_append_sheet(wb2, ws, "DataExport");

  // XLSX.writeFile(wb2, `exports/ug-${fileName}-data-${Date.now()}.xlsx`);
}

function exportToExcel() {
  var disrictsWb = XLSX.utils.json_to_sheet(data.districts);
  var constituencyhWb = XLSX.utils.json_to_sheet(data.constituencies);
  var subCountyWb = XLSX.utils.json_to_sheet(data.subcounties);
  var parishWb = XLSX.utils.json_to_sheet(data.parishes);
  var errors = XLSX.utils.json_to_sheet(data.errors);

  var wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(disrictsWb, ws, "Districts");
  XLSX.utils.book_append_sheet(constituencyhWb, ws, "Constituency");
  XLSX.utils.book_append_sheet(subCountyWb, ws, "Sub-counties");
  XLSX.utils.book_append_sheet(parishWb, ws, "Parishes");
  XLSX.utils.book_append_sheet(errors, ws, "Errors");

  XLSX.writeFile(wb2, `exports/ug-data-${Date.now()}.xlsx`);
}

eventEmitter.on("get-subcounties", getSubcounties);
eventEmitter.on("get-parishes", getParishes);
eventEmitter.on("completed", exportToExcel);

async function startScrapper() {
  let districtResponse = await makeDistrictApiCall();

  console.log(`================================================`);
  console.log(`added ${districtResponse.data.length} districts`);
  console.log(`================================================`);

  data.districts = districtResponse.data;

  writeToExcel(data.districts, "districts");

  getConstituencies(districtResponse.data);
}

startScrapper();
