/**
 * Station Temperature Time Series (ERA5-Land)
 * -------------------------------------------
 * Extracts daily 2 m air temperature (mean, min, max) at many station
 * locations from ERA5-Land and exports one tidy CSV: one row per station
 * per day, in degrees Celsius.
 *
 * How to run
 *   Paste into https://code.earthengine.google.com, set CONFIG (stations
 *   asset, ID field, dates), press Run, start the export from Tasks.
 *
 * Author: Parisa Abbasalizadehrezaei · https://risarezaei.github.io
 * License: MIT
 */

// =============================== CONFIG ===================================
var CONFIG = {
  // Point FeatureCollection with one feature per station.
  // Replace with your asset, e.g. 'users/you/stations'. The inline list
  // below is only an example so the script runs out of the box.
  STATIONS_ASSET: null,
  stations: [
    {id: 'ST01', lon: 51.39, lat: 35.70},
    {id: 'ST02', lon: 46.29, lat: 38.08}
  ],
  ID_FIELD: 'stationid',       // property holding the station ID in the asset

  startDate: '1986-09-23',
  endDate:   '2018-09-23',     // exclusive

  // Which daily statistics to export (ERA5-Land DAILY_AGGR bands)
  variables: {
    t2m_mean_C: 'temperature_2m',
    t2m_min_C:  'temperature_2m_min',
    t2m_max_C:  'temperature_2m_max'
  },

  driveFolder: 'earthengine',
  filePrefix: 'station_temperature_daily',
  chartFirstStation: true
};
// ==========================================================================

var SCALE = 11132;  // ERA5-Land grid spacing (0.1 degree)

// ---- Stations ----------------------------------------------------------
var stations = CONFIG.STATIONS_ASSET
  ? ee.FeatureCollection(CONFIG.STATIONS_ASSET)
      .select([CONFIG.ID_FIELD], ['station_id'])
  : ee.FeatureCollection(CONFIG.stations.map(function (s) {
      return ee.Feature(ee.Geometry.Point([s.lon, s.lat]), {station_id: s.id});
    }));

// ---- Daily ERA5-Land, Kelvin -> Celsius ----------------------------------
var names = Object.keys(CONFIG.variables);
var bands = names.map(function (k) { return CONFIG.variables[k]; });

var daily = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
  .filterDate(CONFIG.startDate, CONFIG.endDate)
  .select(bands, names)
  .map(function (img) {
    return img.subtract(273.15)
      .copyProperties(img, ['system:time_start']);
  });

print('Days in period', daily.size());

// ---- Sample every day at every station (tidy / long format) ------------
var table = daily.map(function (img) {
  var date = img.date().format('YYYY-MM-dd');
  return img.reduceRegions({
    collection: stations,
    reducer: ee.Reducer.first(),   // multi-band: one property per band name
    scale: SCALE
  }).map(function (f) {
    return ee.Feature(null, {})
      .copyProperties(f, names.concat(['station_id']))
      .set('date', date);
  });
}).flatten();

print('Example rows', table.limit(5));

// ---- Quick look: chart for the first station (last 2 years) -------------
// Charts are limited to 5000 points, so only the end of the record is shown.
if (CONFIG.chartFirstStation) {
  var first = ee.Feature(stations.first());
  var chartEnd = ee.Date(CONFIG.endDate);
  print(ui.Chart.image.series({
    imageCollection: daily.select(names).filterDate(chartEnd.advance(-2, 'year'), chartEnd),
    region: first.geometry(),
    reducer: ee.Reducer.first(),
    scale: SCALE
  }).setOptions({
    title: 'Daily 2 m temperature at the first station, last 2 years (°C)',
    vAxis: {title: '°C'},
    lineWidth: 1,
    pointSize: 0,
    series: {0: {color: '444444'}, 1: {color: '1e88e5'}, 2: {color: 'e53935'}}
  }));
  Map.centerObject(stations, 6);
}
Map.addLayer(stations, {color: 'ff0000'}, 'Stations');

// ---- Export ------------------------------------------------------------
Export.table.toDrive({
  collection: table,
  description: CONFIG.filePrefix,
  folder: CONFIG.driveFolder,
  fileNamePrefix: CONFIG.filePrefix,
  fileFormat: 'CSV',
  selectors: ['station_id', 'date'].concat(names)
});
