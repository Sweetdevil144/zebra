let cpcdoci = require("./app_server/Models/cpcdocSchema");
let cpcdoc = cpcdoci.cpcdocs;
let procdoci = require("./app_server/Models/procdocSchema");
let procdoc = procdoci.procdocs;
let usagedoci = require("./app_server/Models/usagedocSchema");
let usagedoc = usagedoci.usagedocs;
let workloaddoci = require("./app_server/Models/workloaddocSchema");
let workloaddoc = workloaddoci.wokloaddocs;
var Zconfig = require("./config/Zconfig");
let appbaseurl = Zconfig.appurl;
let appbaseport = Zconfig.appport;
let dbinterval = Zconfig.dbinterval;
let httptype = Zconfig.httptype;
const axios = require('axios');

console.log('mongo started');
const cpuRealtimeURL = `${httptype}://${appbaseurl}:${appbaseport}/rmfm3?report=CPC`;
const procRealtimeURL = `${httptype}://${appbaseurl}:${appbaseport}/rmfm3?report=PROC`;
const usageRealtimeURL = `${httptype}://${appbaseurl}:${appbaseport}/rmfm3?report=USAGE`;
const sysRealtimeURL = `${httptype}://${appbaseurl}:${appbaseport}/rmfm3?reports=SYSINFO`;
const syssumRealtimeURL = `${httptype}://${appbaseurl}:${appbaseport}/rmfm3?reports=SYSSUM&resource=\",,SYSPLEX\"`; // TODO: make dynamic?

/**
 * getdata function query this app using its endpoint for JSON data to save to mongo DB 
 * @param {URLString} appbaseurl - A recognised URL for this app that returns a JSON
 * @param {JSON} fn - A callback function containing the required JSON
 */
function getdata(appbaseurl, fn){ // Function to make request for JSON using this apps Endpoints
  axios.get(appbaseurl)
  .then(function (response) {
    // handle success
    fn(response.data);
  })
  .catch(function (error) {
    // handle error
    fn(error);
  })
  .then(function () {
    // always executed
  });
}

/**
 * fedDatabase function handles saving the JSON from getdata into MongoDB
 * @param {JSON} data - JSON returned by getdataFunction
 * @param {string} type - Type of data (CPC, PROC or USAGE)
 * @param {*} fn - A callback function that does nothing
 */
async function fedDatabase(data, type, fn ){
  if(data != "error"){ // if data is not equal to error.... getdata function can return error instead of JSON when something goes wrong
    var JSONBody = data;
    var parm = JSONBody["title"] // represent the value of title key in JSONBody
    var timestamp = (JSONBody["timestart"]).split(" "); // represent the value of timestart key in JSONBody
    var date = timestamp[0];
    var time = timestamp[1];

    var datetime = toDateTime(date, time);

    if(type === 'CPC'){ // if data type is equal to CPC
        var cpc = new cpcdoc({ // Push the following key value pairs as subdocument
            title: parm,
            datetime: datetime,
            caption: JSONBody["caption"], // JSONBody caption for caption Key
            lpar: JSONBody["table"] // JSONBody table for lpar Key
        })

        cpc.save((err, cpc) => { // save Subdocument to existing Document
          if(err){
            console.log('error');
          } else{
            console.log(`CPC Updated Successflly`);
          }
        })
    }else if(type === 'PROC'){ // if data type is equal to PROC
        var proc = new procdoc({ // Push the following key value pairs as subdocument
            title: parm,
            datetime: datetime,
            lpar_proc: JSONBody["table"] // JSONBody table for lpar Key
        })

        proc.save((err, Proc) => { // save Subdocument to existing Document
          if(err){
            console.log('error');
          } else{
            console.log(`PROC Updated Successflly`);
          }
        })
    }else if(type === 'USAGE'){ // if data type is equal to USAGE
        var usage = new usagedoc({ // Push the following key value pairs as subdocument
            title: parm,
            datetime: datetime,
            lpar_usage: JSONBody["table"] // JSONBody table for lpar Key
        })
        usage.save((err, USage) => { // save Subdocument to existing Document
          if(err){
            console.log('error');
          } else{
            console.log(`USAGE Updated Successflly`);
          }
        })
    }else if(type === 'WKL'){ // if data type is equal to CPC
        var { SYSINFO, SYSSUM } = JSONBody["classes"];
        var workload =  new workloaddoc({ // Push the following key value pairs as subdocument
            title: parm,
            datetime: datetime,
            Caption: JSONBody["caption"], // JSONBody caption for caption Key
            Class: joinWorkloadData(SYSINFO, [ SYSSUM ]), // join SYSINFO and SYSSUM data into same entry
        })
    
        workload.save((err, wkl) => { // save Subdocument to existing Document
        if(err){
            console.log(err.message);
        } else{
            console.log(`Workload Updated Successflly`);
        }
            
        })
    }
  }
}

setInterval(() => { // Set interval function allows this routine to run at a specified intervals
  getdata(cpuRealtimeURL, function(data){ // get CPC data in JSON format
    fedDatabase(data, 'CPC', function(c){}) // Save CPC JSON to MongoDB
  });

  getdata(procRealtimeURL, function(data){ // get PROC data in JSON format
    fedDatabase(data, 'PROC', function(c){}) // Save PROC JSON to MongoDB
  });

  getdata(usageRealtimeURL, function(data){ // get USAGE data in JSON format
    fedDatabase(data, 'USAGE', function(c){}) // Save USAGE JSON to MongoDB
  });

  getdata(sysRealtimeURL, function(sysinfoData){ // get Workload data in JSON format
    getdata(syssumRealtimeURL, function(syssumData) { // get SYSSUM data to combine with SYSINFO
      fedDatabase({
        title: "Workload Activity",
        timestart: sysinfoData["timestart"],
        caption: { ...sysinfoData["caption"], ...syssumData["caption"] },
        classes: { SYSINFO: sysinfoData["table"], SYSSUM: syssumData["table"] }, 
      }, 'WKL', function(c){}); // Save Workload JSON to MongoDB
    });
  });
}, parseInt(dbinterval) * 1000); // duration of the interval

/**
 * Converts date and time strings to Date object
 * @param {String} date String representing date in MM/DD/YYYY format
 * @param {String} time String representing time in HOUR:MINUTE:SECONDS format
 * @returns Date object representing the date and time of the record
 */
function toDateTime(date, time) {
  const [month, day, year] = date.split("/");
  const dateTimeString = `${year}-${month}-${day}T${time}`;
  return Date.parse(dateTimeString);
}

/**
 * Joins different reports into one class name and type
 * @param {Object} sysinfo The base data
 * @param {Array} reportsToJoin  The data to join into sysinfo
 * @returns The data joined on class name and type
 */
function joinWorkloadData(sysinfo, [ syssum ]) {
  let joinedData = [];
  for (let i = 0; i < sysinfo.length; i++) {
    let found = false;
    for (let j = 0; j < syssum.length; j++) {
      if (sysinfo[i]["SYSDDSIN"] === syssum[j]["SUMDDSIN"] &&
          sysinfo[i]["SYSDDSIT"] === syssum[j]["SUMDDSIT"] &&
          sysinfo[i]["SYSDDSIP"] === syssum[j]["SUMDDSIP"] ) {
        found = true;
        joinedData.push({
          ...sysinfo[i],
          ...syssum[j]
        });
        break;
      }
    }
    if (!found) {
      for (let j = 0; j < syssum.length; j++) {
        if (sysinfo[i]["SYSDDSIN"] === syssum[j]["SUMDDSIN"] &&
            sysinfo[i]["SYSDDSIT"] === syssum[j]["SUMDDSIT"] ) {
          found = true;
          joinedData.push({
            ...sysinfo[i],
            ...syssum[j]
          });
          break;
        }
      }
    }
    if (!found) {
      joinedData.push({ 
        ...sysinfo[i],
        SUMGRP:"",
        SUMTYP:"",
        SUMRCTNT:"",
        SUMIMP:"",
        SUMEVG:"",
        SUMEVA:"",
        SUMRTGTM:"",
        SUMRTGP:"",
        SUMRTATM:"",
        SUMRTAP:"",
        SUMPFID:"",
        SUMTRAN:"",
        SUMARTWM:"",
        SUMARTAM:"",
        SUMARTTM:"",
        SUMARTQM:"",
        SUMARTRM:"",
        SUMARTIM:"",
        SUMARTCM:"",
        SUMGOA:"",
        SUMDUR:"",
        SUMRES:"",
        SUMRGTYP:"",
        SUMSMI:"",
        SUMSMA:"",
        SUMSRA:"",
        SUMRGSPC:"",
        SUMCRIT:"",
        SUMHONP:"",
        SUMMLIM:"",
        SUMMEMUS:"",
        SUMDDSIN:"",
        SUMDDSIT:"",
        SUMDDSIP:"",
        SUMEGRP:"",
        SUMRTGT:"",
        SUMRTAT:"",
        SUMARTW:"",
        SUMARTA:"",
        SUMARTT:"",
        SUMARTQ:"",
        SUMARTR:"",
        SUMARTI:"",
        SUMARTC:""
      });
    }
  }
  return joinedData;
}
