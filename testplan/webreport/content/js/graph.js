/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 100.0, "series": [{"data": [[0.0, 1.0]], "isOverall": false, "label": "43 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "90 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "8/获取所有用户组", "isController": false}, {"data": [[0.0, 34.0]], "isOverall": false, "label": "10 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "17 /dwf/v1/meta/attributes/crus", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "18 /获取属性信息", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "21 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "87 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "21 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "31 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "20 /编辑属性", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "35 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "4 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "20 /dwf/v1/meta/relations", "isController": false}, {"data": [[0.0, 22.0]], "isOverall": false, "label": "12 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "5 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "15 /新增属性", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "1 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "18 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "97 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "113 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "5/根据条件获取用户", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "13 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "115 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "53 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "44 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "37 /删除实体类", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "34 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "37 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "8 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "24 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "2/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "22 /dwf/v1/meta/attributes/crus/bind-classes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "31 /编辑关联类属性", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "120 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "2/创建新用户并添加", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "71 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "3/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "38 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "37 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "80 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "12 /新增实体类A", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "45 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "86 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "7 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "8 /dwf/v1/org/users", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "28 /绑定属性到新建的实体类", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "28 /删除实体类属性", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "32 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "56 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "74 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 23.0]], "isOverall": false, "label": "9 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "65 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "4/获取指定用户", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "36 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "39 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "107 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "7 /dwf/v1/org/users", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "99 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "27 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[0.0, 23.0]], "isOverall": false, "label": "15 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "84 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "118 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "36 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "75 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "18 /新增实体类", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "40 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "23 /dwf/v1/meta/relations-create", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "121 /dwf/v1/meta/class/hopsotal/views/hoij", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "7/dwf/v1/org/users", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "46 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "66 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "55 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "26 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "21 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "106 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "4 /dwf/v1/org/users", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "17 /dwf/v1/meta/relations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "111 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "11 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "104 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "32 /dwf/v1/meta/relations/guanlianlei/attributes-bind", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "32 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "11 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "25 /编辑实体类新增属性", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "7 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "14 /新增实体类B", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "24 /新增关联类", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "7/删除用户组", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "13 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "1/新增独立用户组", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "67 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "10添加用户", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "79 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "43 /删除实体类A", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "116 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "69 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "117 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "36 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "BeanShell Sampler", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "47 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "50 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "72 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "83 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "109 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "30 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "12 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "11 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-update", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "2 /dwf/v1/org/users", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "114 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "59 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "91 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "12/删除用户", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "21 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "85 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "125 /删除属性", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "29 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "33 /绑定属性到类", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "62 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "27 /解除类与属性的绑定", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "110 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "94 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "16 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "39 /dwf/v1/meta/relations-delete/guanlianlei", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "103 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "88 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "54 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "28 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "81 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 22.0]], "isOverall": false, "label": "5 /dwf/v1/org/users", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "11/dwf/v1/org/users", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "60 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "93 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "58 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "102 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "112 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "119 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "89 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 23.0]], "isOverall": false, "label": "3 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "31 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "16 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "64 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "19 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "108 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "48 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "68 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "41 /删除关联类属性", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "27 /dwf/v1/meta/entities/hopsotal/attributes-bind", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "5/dwf/v1/org/groups/tree", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "1/dwf/v1/login", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "6/dwf/v1/org/users", "isController": false}, {"data": [[0.0, 22.0]], "isOverall": false, "label": "6 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "6 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "4 /modeler-web/img/logo.599b3aa8.png", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "77 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "100 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "41 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "49 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "70 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "78 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "24 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "57 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "122 /实体类建表", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "9/dwf/v1/org/users-create", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "52 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "124 /删除实体类", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "63 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "101 /dwf/v1/meta/resources", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "24 /删除属性", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "3/添加用户到当前组", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "26 /创建属性", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "25 /dwf/v1/meta/relations", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "4/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "26 /绑定属性到类", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "38 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[0.0, 23.0]], "isOverall": false, "label": "2 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 100.0]], "isOverall": false, "label": "8/dwf/v1/org/groups/tree", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "44 /删除实体类B", "isController": false}, {"data": [[0.0, 23.0]], "isOverall": false, "label": "1 /dwf/v1/login", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attributes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "61 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "28 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "42 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "3 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "22 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "82 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "51 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "123 /删除表单", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "16 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "8 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "95 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "98 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "96 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[0.0, 10.0]], "isOverall": false, "label": "6/删除用户", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[0.0, 12.0]], "isOverall": false, "label": "17 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "76 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "40 /删除关联类", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "105 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "23 /dwf/v1/meta/attributes-delete/crus", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "42 /dwf/v1/meta/relations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "18 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "73 /dwf/v1/meta/entities", "isController": false}, {"data": [[0.0, 11.0]], "isOverall": false, "label": "9 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "19 /创建实体类", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "92 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[0.0, 1.0]], "isOverall": false, "label": "6 /dwf/v1/org/users", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 4.9E-324, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 35.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2587.0, "series": [{"data": [[3.0, 35.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 2587.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.55204034E12, "maxY": 96.22749999999999, "series": [{"data": [[1.55204034E12, 96.22749999999999]], "isOverall": false, "label": "用户管理user_management", "isController": false}, {"data": [[1.55204034E12, 9.7875]], "isOverall": false, "label": "用户组管理user_group", "isController": false}, {"data": [[1.55204034E12, 10.876363636363635]], "isOverall": false, "label": "属性库管理attribute_model", "isController": false}, {"data": [[1.55204034E12, 1.0]], "isOverall": false, "label": "实体类创建表单Entity_class_form", "isController": false}, {"data": [[1.55204034E12, 1.0]], "isOverall": false, "label": "Token", "isController": false}, {"data": [[1.55204034E12, 10.877149877149877]], "isOverall": false, "label": "实体类建模ItemClass_model", "isController": false}, {"data": [[1.55204034E12, 10.911157024793388]], "isOverall": false, "label": "关联类建模RelationClass_model", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55204034E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.0, "maxY": 271.0, "series": [{"data": [[1.0, 29.0]], "isOverall": false, "label": "43 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "43 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "90 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "90 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[1.0, 20.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 20.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[2.0, 13.0], [1.0, 30.0], [10.0, 11.125]], "isOverall": false, "label": "8/获取所有用户组", "isController": false}, {"data": [[8.299999999999999, 13.200000000000001]], "isOverall": false, "label": "8/获取所有用户组-Aggregated", "isController": false}, {"data": [[1.0, 4.0], [11.0, 43.33333333333333]], "isOverall": false, "label": "10 /dwf/v1/meta/attributes", "isController": false}, {"data": [[10.705882352941176, 42.17647058823529]], "isOverall": false, "label": "10 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[11.0, 3.9090909090909087]], "isOverall": false, "label": "17 /dwf/v1/meta/attributes/crus", "isController": false}, {"data": [[11.0, 3.9090909090909087]], "isOverall": false, "label": "17 /dwf/v1/meta/attributes/crus-Aggregated", "isController": false}, {"data": [[11.0, 14.0]], "isOverall": false, "label": "18 /获取属性信息", "isController": false}, {"data": [[11.0, 14.0]], "isOverall": false, "label": "18 /获取属性信息-Aggregated", "isController": false}, {"data": [[11.0, 2.727272727272727]], "isOverall": false, "label": "21 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[11.0, 2.727272727272727]], "isOverall": false, "label": "21 /dwf/v1/meta/entities/newItemClass/attributes-Aggregated", "isController": false}, {"data": [[1.0, 27.0]], "isOverall": false, "label": "87 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 27.0]], "isOverall": false, "label": "87 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[11.0, 74.99999999999999]], "isOverall": false, "label": "21 /dwf/v1/meta/attributes", "isController": false}, {"data": [[11.0, 74.99999999999999]], "isOverall": false, "label": "21 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[11.0, 10.272727272727273]], "isOverall": false, "label": "31 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[11.0, 10.272727272727273]], "isOverall": false, "label": "31 /dwf/v1/meta/entities/newItemClass/attributes-Aggregated", "isController": false}, {"data": [[11.0, 19.63636363636364]], "isOverall": false, "label": "20 /编辑属性", "isController": false}, {"data": [[11.0, 19.63636363636364]], "isOverall": false, "label": "20 /编辑属性-Aggregated", "isController": false}, {"data": [[11.0, 11.818181818181818]], "isOverall": false, "label": "35 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[11.0, 11.818181818181818]], "isOverall": false, "label": "35 /dwf/v1/meta/relations/guanlianlei/attributes-Aggregated", "isController": false}, {"data": [[1.0, 18.0], [11.0, 8.09090909090909]], "isOverall": false, "label": "4 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[10.166666666666666, 8.916666666666666]], "isOverall": false, "label": "4 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[11.0, 73.36363636363635]], "isOverall": false, "label": "20 /dwf/v1/meta/relations", "isController": false}, {"data": [[11.0, 73.36363636363635]], "isOverall": false, "label": "20 /dwf/v1/meta/relations-Aggregated", "isController": false}, {"data": [[11.0, 15.772727272727275]], "isOverall": false, "label": "12 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[11.0, 15.772727272727275]], "isOverall": false, "label": "12 /dwf/v1/meta/attribute-types-Aggregated", "isController": false}, {"data": [[1.0, 3.0], [11.0, 17.18181818181818]], "isOverall": false, "label": "5 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[10.166666666666666, 15.999999999999998]], "isOverall": false, "label": "5 /dwf/v1/org/groups/tree-Aggregated", "isController": false}, {"data": [[11.0, 26.454545454545453]], "isOverall": false, "label": "15 /新增属性", "isController": false}, {"data": [[11.0, 26.454545454545453]], "isOverall": false, "label": "15 /新增属性-Aggregated", "isController": false}, {"data": [[11.0, 24.545454545454547]], "isOverall": false, "label": "1 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[11.0, 24.545454545454547]], "isOverall": false, "label": "1 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "18 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "18 /dwf/v1/meta/entities-create-Aggregated", "isController": false}, {"data": [[1.0, 151.0]], "isOverall": false, "label": "97 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.0, 151.0]], "isOverall": false, "label": "97 /dwf/v1/omf/entities/hopsotal/objects/count-Aggregated", "isController": false}, {"data": [[1.0, 2.0]], "isOverall": false, "label": "113 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 2.0]], "isOverall": false, "label": "113 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[10.0, 12.299999999999999]], "isOverall": false, "label": "5/根据条件获取用户", "isController": false}, {"data": [[10.0, 12.299999999999999]], "isOverall": false, "label": "5/根据条件获取用户-Aggregated", "isController": false}, {"data": [[11.0, 8.454545454545455]], "isOverall": false, "label": "13 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[11.0, 8.454545454545455]], "isOverall": false, "label": "13 /dwf/v1/meta/dbtables-Aggregated", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "115 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "115 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 38.0]], "isOverall": false, "label": "53 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 38.0]], "isOverall": false, "label": "53 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "44 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "44 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[8.0, 68.0], [2.0, 71.0], [1.0, 73.0], [9.0, 68.0], [10.0, 67.0], [11.0, 21.0], [6.0, 68.66666666666667], [3.0, 69.0]], "isOverall": false, "label": "37 /删除实体类", "isController": false}, {"data": [[6.454545454545455, 64.63636363636364]], "isOverall": false, "label": "37 /删除实体类-Aggregated", "isController": false}, {"data": [[11.0, 75.81818181818183]], "isOverall": false, "label": "34 /dwf/v1/meta/attributes", "isController": false}, {"data": [[11.0, 75.81818181818183]], "isOverall": false, "label": "34 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[1.0, 5.0]], "isOverall": false, "label": "37 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 5.0]], "isOverall": false, "label": "37 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[11.0, 10.909090909090908]], "isOverall": false, "label": "8 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[11.0, 10.909090909090908]], "isOverall": false, "label": "8 /dwf/v1/meta/attribute-types-Aggregated", "isController": false}, {"data": [[1.0, 15.0]], "isOverall": false, "label": "24 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.0, 15.0]], "isOverall": false, "label": "24 /dwf/v1/meta/entities/hopsotal/attributes-Aggregated", "isController": false}, {"data": [[100.0, 14.129999999999999]], "isOverall": false, "label": "2/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[100.0, 14.129999999999999]], "isOverall": false, "label": "2/dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[11.0, 20.636363636363637]], "isOverall": false, "label": "22 /dwf/v1/meta/attributes/crus/bind-classes", "isController": false}, {"data": [[11.0, 20.636363636363637]], "isOverall": false, "label": "22 /dwf/v1/meta/attributes/crus/bind-classes-Aggregated", "isController": false}, {"data": [[11.0, 17.272727272727273]], "isOverall": false, "label": "31 /编辑关联类属性", "isController": false}, {"data": [[11.0, 17.272727272727273]], "isOverall": false, "label": "31 /编辑关联类属性-Aggregated", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "120 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "120 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[10.0, 18.8]], "isOverall": false, "label": "2/创建新用户并添加", "isController": false}, {"data": [[10.0, 18.8]], "isOverall": false, "label": "2/创建新用户并添加-Aggregated", "isController": false}, {"data": [[1.0, 8.0]], "isOverall": false, "label": "71 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 8.0]], "isOverall": false, "label": "71 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[11.0, 6.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[11.0, 6.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities/newItemClass/backward-relations-Aggregated", "isController": false}, {"data": [[100.0, 96.26999999999997]], "isOverall": false, "label": "3/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[100.0, 96.26999999999997]], "isOverall": false, "label": "3/dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[1.0, 89.0]], "isOverall": false, "label": "38 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 89.0]], "isOverall": false, "label": "38 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[11.0, 10.454545454545455]], "isOverall": false, "label": "37 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[11.0, 10.454545454545455]], "isOverall": false, "label": "37 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi-Aggregated", "isController": false}, {"data": [[1.0, 42.0]], "isOverall": false, "label": "80 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 42.0]], "isOverall": false, "label": "80 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[11.0, 55.18181818181818]], "isOverall": false, "label": "12 /新增实体类A", "isController": false}, {"data": [[11.0, 55.18181818181818]], "isOverall": false, "label": "12 /新增实体类A-Aggregated", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "45 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "45 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "86 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "86 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[11.0, 10.999999999999998]], "isOverall": false, "label": "7 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[11.0, 10.999999999999998]], "isOverall": false, "label": "7 /dwf/v1/org/groups/tree-Aggregated", "isController": false}, {"data": [[11.0, 12.727272727272727]], "isOverall": false, "label": "8 /dwf/v1/org/users", "isController": false}, {"data": [[11.0, 12.727272727272727]], "isOverall": false, "label": "8 /dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[1.0, 31.27272727272727]], "isOverall": false, "label": "28 /绑定属性到新建的实体类", "isController": false}, {"data": [[1.0, 31.27272727272727]], "isOverall": false, "label": "28 /绑定属性到新建的实体类-Aggregated", "isController": false}, {"data": [[11.0, 18.090909090909093]], "isOverall": false, "label": "28 /删除实体类属性", "isController": false}, {"data": [[11.0, 18.090909090909093]], "isOverall": false, "label": "28 /删除实体类属性-Aggregated", "isController": false}, {"data": [[1.0, 39.0]], "isOverall": false, "label": "32 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 39.0]], "isOverall": false, "label": "32 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 50.0]], "isOverall": false, "label": "56 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 50.0]], "isOverall": false, "label": "56 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "74 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "74 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 20.0], [11.0, 16.136363636363637]], "isOverall": false, "label": "9 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[10.565217391304348, 16.304347826086957]], "isOverall": false, "label": "9 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "65 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "65 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[10.0, 15.5]], "isOverall": false, "label": "4/获取指定用户", "isController": false}, {"data": [[10.0, 15.5]], "isOverall": false, "label": "4/获取指定用户-Aggregated", "isController": false}, {"data": [[11.0, 12.0]], "isOverall": false, "label": "36 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[11.0, 12.0]], "isOverall": false, "label": "36 /dwf/v1/meta/entities/newItemClass/forward-relations-Aggregated", "isController": false}, {"data": [[1.0, 35.0]], "isOverall": false, "label": "39 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 35.0]], "isOverall": false, "label": "39 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 28.0]], "isOverall": false, "label": "107 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.0, 28.0]], "isOverall": false, "label": "107 /dwf/v1/omf/entities/hopsotal/objects-Aggregated", "isController": false}, {"data": [[1.0, 23.0], [11.0, 9.090909090909092]], "isOverall": false, "label": "7 /dwf/v1/org/users", "isController": false}, {"data": [[10.166666666666666, 10.25]], "isOverall": false, "label": "7 /dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[1.0, 43.0]], "isOverall": false, "label": "99 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 43.0]], "isOverall": false, "label": "99 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[11.0, 6.0]], "isOverall": false, "label": "27 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[11.0, 6.0]], "isOverall": false, "label": "27 /dwf/v1/meta/relations/guanlianlei/attributes-Aggregated", "isController": false}, {"data": [[1.0, 11.0], [11.0, 40.72727272727272]], "isOverall": false, "label": "15 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[10.565217391304348, 39.43478260869564]], "isOverall": false, "label": "15 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "84 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "84 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[1.0, 5.0]], "isOverall": false, "label": "118 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 5.0]], "isOverall": false, "label": "118 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[1.0, 3.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.0, 3.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/hopsotal/attributes-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "36 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "36 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[1.0, 25.0]], "isOverall": false, "label": "75 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 25.0]], "isOverall": false, "label": "75 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[11.0, 77.27272727272727]], "isOverall": false, "label": "18 /新增实体类", "isController": false}, {"data": [[11.0, 77.27272727272727]], "isOverall": false, "label": "18 /新增实体类-Aggregated", "isController": false}, {"data": [[1.0, 37.0]], "isOverall": false, "label": "40 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 37.0]], "isOverall": false, "label": "40 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[11.0, 17.81818181818182]], "isOverall": false, "label": "23 /dwf/v1/meta/relations-create", "isController": false}, {"data": [[11.0, 17.81818181818182]], "isOverall": false, "label": "23 /dwf/v1/meta/relations-create-Aggregated", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "121 /dwf/v1/meta/class/hopsotal/views/hoij", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "121 /dwf/v1/meta/class/hopsotal/views/hoij-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[100.0, 60.06000000000002]], "isOverall": false, "label": "7/dwf/v1/org/users", "isController": false}, {"data": [[100.0, 60.06000000000002]], "isOverall": false, "label": "7/dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "46 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "46 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "66 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "66 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 46.0]], "isOverall": false, "label": "55 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 46.0]], "isOverall": false, "label": "55 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[11.0, 14.90909090909091]], "isOverall": false, "label": "26 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[11.0, 14.90909090909091]], "isOverall": false, "label": "26 /dwf/v1/meta/classes/guanlianlei/scripts-Aggregated", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "21 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "21 /dwf/v1/meta/classes/hopsotal/scripts-Aggregated", "isController": false}, {"data": [[1.0, 6.0]], "isOverall": false, "label": "106 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.0, 6.0]], "isOverall": false, "label": "106 /dwf/v1/omf/entities/hopsotal/objects-Aggregated", "isController": false}, {"data": [[11.0, 17.090909090909093]], "isOverall": false, "label": "4 /dwf/v1/org/users", "isController": false}, {"data": [[11.0, 17.090909090909093]], "isOverall": false, "label": "4 /dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[11.0, 3.0]], "isOverall": false, "label": "17 /dwf/v1/meta/relations", "isController": false}, {"data": [[11.0, 3.0]], "isOverall": false, "label": "17 /dwf/v1/meta/relations-Aggregated", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "111 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "111 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[11.0, 10.0]], "isOverall": false, "label": "11 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[11.0, 10.0]], "isOverall": false, "label": "11 /dwf/v1/meta/entities-create-Aggregated", "isController": false}, {"data": [[1.0, 15.0]], "isOverall": false, "label": "104 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 15.0]], "isOverall": false, "label": "104 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[1.0, 5.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.0, 5.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attribute-types-Aggregated", "isController": false}, {"data": [[11.0, 5.090909090909091]], "isOverall": false, "label": "32 /dwf/v1/meta/relations/guanlianlei/attributes-bind", "isController": false}, {"data": [[11.0, 5.090909090909091]], "isOverall": false, "label": "32 /dwf/v1/meta/relations/guanlianlei/attributes-bind-Aggregated", "isController": false}, {"data": [[11.0, 72.0909090909091]], "isOverall": false, "label": "32 /dwf/v1/meta/attributes", "isController": false}, {"data": [[11.0, 72.0909090909091]], "isOverall": false, "label": "32 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[1.0, 4.0], [11.0, 4.7272727272727275]], "isOverall": false, "label": "11 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[10.166666666666666, 4.666666666666667]], "isOverall": false, "label": "11 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[11.0, 15.272727272727272]], "isOverall": false, "label": "25 /编辑实体类新增属性", "isController": false}, {"data": [[11.0, 15.272727272727272]], "isOverall": false, "label": "25 /编辑实体类新增属性-Aggregated", "isController": false}, {"data": [[11.0, 25.18181818181818]], "isOverall": false, "label": "7 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[11.0, 25.18181818181818]], "isOverall": false, "label": "7 /dwf/v1/meta/dbtables-Aggregated", "isController": false}, {"data": [[11.0, 70.63636363636364]], "isOverall": false, "label": "14 /新增实体类B", "isController": false}, {"data": [[11.0, 70.63636363636364]], "isOverall": false, "label": "14 /新增实体类B-Aggregated", "isController": false}, {"data": [[11.0, 64.27272727272727]], "isOverall": false, "label": "24 /新增关联类", "isController": false}, {"data": [[11.0, 64.27272727272727]], "isOverall": false, "label": "24 /新增关联类-Aggregated", "isController": false}, {"data": [[10.0, 20.4]], "isOverall": false, "label": "7/删除用户组", "isController": false}, {"data": [[10.0, 20.4]], "isOverall": false, "label": "7/删除用户组-Aggregated", "isController": false}, {"data": [[11.0, 34.54545454545455]], "isOverall": false, "label": "13 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[11.0, 34.54545454545455]], "isOverall": false, "label": "13 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[10.0, 40.800000000000004]], "isOverall": false, "label": "1/新增独立用户组", "isController": false}, {"data": [[10.0, 40.800000000000004]], "isOverall": false, "label": "1/新增独立用户组-Aggregated", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "67 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "67 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[100.0, 153.75]], "isOverall": false, "label": "10添加用户", "isController": false}, {"data": [[100.0, 153.75]], "isOverall": false, "label": "10添加用户-Aggregated", "isController": false}, {"data": [[1.0, 38.0]], "isOverall": false, "label": "79 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 38.0]], "isOverall": false, "label": "79 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[11.0, 35.909090909090914]], "isOverall": false, "label": "43 /删除实体类A", "isController": false}, {"data": [[11.0, 35.909090909090914]], "isOverall": false, "label": "43 /删除实体类A-Aggregated", "isController": false}, {"data": [[1.0, 8.0]], "isOverall": false, "label": "116 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 8.0]], "isOverall": false, "label": "116 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 32.0]], "isOverall": false, "label": "69 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 32.0]], "isOverall": false, "label": "69 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 7.0]], "isOverall": false, "label": "117 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 7.0]], "isOverall": false, "label": "117 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[11.0, 3.0]], "isOverall": false, "label": "36 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[11.0, 3.0]], "isOverall": false, "label": "36 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi-Aggregated", "isController": false}, {"data": [[1.0, 1.0]], "isOverall": false, "label": "BeanShell Sampler", "isController": false}, {"data": [[1.0, 1.0]], "isOverall": false, "label": "BeanShell Sampler-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "47 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "47 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 20.0]], "isOverall": false, "label": "50 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 20.0]], "isOverall": false, "label": "50 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 21.0]], "isOverall": false, "label": "72 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 21.0]], "isOverall": false, "label": "72 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 40.0]], "isOverall": false, "label": "83 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 40.0]], "isOverall": false, "label": "83 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 18.0]], "isOverall": false, "label": "109 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 18.0]], "isOverall": false, "label": "109 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[11.0, 11.999999999999998]], "isOverall": false, "label": "30 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[11.0, 11.999999999999998]], "isOverall": false, "label": "30 /dwf/v1/meta/attributes-create-Aggregated", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "12 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "12 /dwf/v1/meta/dbtables-Aggregated", "isController": false}, {"data": [[11.0, 4.454545454545454]], "isOverall": false, "label": "11 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[11.0, 4.454545454545454]], "isOverall": false, "label": "11 /dwf/v1/meta/attribute-types-Aggregated", "isController": false}, {"data": [[11.0, 3.5454545454545454]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-update", "isController": false}, {"data": [[11.0, 3.5454545454545454]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-update-Aggregated", "isController": false}, {"data": [[11.0, 4.909090909090909]], "isOverall": false, "label": "2 /dwf/v1/org/users", "isController": false}, {"data": [[11.0, 4.909090909090909]], "isOverall": false, "label": "2 /dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "114 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "114 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 34.0]], "isOverall": false, "label": "59 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 34.0]], "isOverall": false, "label": "59 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "91 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "91 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[34.0, 102.5], [42.0, 103.0], [45.0, 104.0], [48.0, 101.875], [51.0, 96.33333333333333], [53.0, 90.5], [55.0, 91.0], [54.0, 88.0], [61.0, 88.66666666666667], [64.0, 85.0], [68.0, 81.25], [73.0, 81.8], [5.0, 129.4], [86.0, 70.0], [90.0, 73.0], [89.0, 77.0], [88.0, 75.0], [92.0, 73.66666666666667], [97.0, 63.6], [100.0, 58.0], [20.0, 126.0], [21.0, 126.75], [22.0, 125.0], [24.0, 124.22222222222223], [26.0, 116.0], [27.0, 121.0], [30.0, 116.25]], "isOverall": false, "label": "12/删除用户", "isController": false}, {"data": [[54.71999999999998, 96.41]], "isOverall": false, "label": "12/删除用户-Aggregated", "isController": false}, {"data": [[11.0, 31.54545454545454]], "isOverall": false, "label": "21 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[11.0, 31.54545454545454]], "isOverall": false, "label": "21 /dwf/v1/meta/class-names-min-Aggregated", "isController": false}, {"data": [[1.0, 22.0]], "isOverall": false, "label": "85 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 22.0]], "isOverall": false, "label": "85 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[1.0, 20.27272727272727]], "isOverall": false, "label": "125 /删除属性", "isController": false}, {"data": [[1.0, 20.27272727272727]], "isOverall": false, "label": "125 /删除属性-Aggregated", "isController": false}, {"data": [[11.0, 9.545454545454545]], "isOverall": false, "label": "30 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[11.0, 9.545454545454545]], "isOverall": false, "label": "30 /dwf/v1/meta/entities/newItemClass/attributes-bind-Aggregated", "isController": false}, {"data": [[11.0, 8.181818181818182]], "isOverall": false, "label": "29 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[11.0, 8.181818181818182]], "isOverall": false, "label": "29 /dwf/v1/meta/relations/guanlianlei/attributes-Aggregated", "isController": false}, {"data": [[11.0, 43.18181818181819]], "isOverall": false, "label": "33 /绑定属性到类", "isController": false}, {"data": [[11.0, 43.18181818181819]], "isOverall": false, "label": "33 /绑定属性到类-Aggregated", "isController": false}, {"data": [[1.0, 26.0]], "isOverall": false, "label": "62 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 26.0]], "isOverall": false, "label": "62 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[11.0, 21.545454545454547]], "isOverall": false, "label": "27 /解除类与属性的绑定", "isController": false}, {"data": [[11.0, 21.545454545454547]], "isOverall": false, "label": "27 /解除类与属性的绑定-Aggregated", "isController": false}, {"data": [[1.0, 8.0]], "isOverall": false, "label": "110 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 8.0]], "isOverall": false, "label": "110 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "94 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "94 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[11.0, 76.9090909090909]], "isOverall": false, "label": "16 /dwf/v1/meta/attributes", "isController": false}, {"data": [[11.0, 76.9090909090909]], "isOverall": false, "label": "16 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[11.0, 3.9090909090909087]], "isOverall": false, "label": "39 /dwf/v1/meta/relations-delete/guanlianlei", "isController": false}, {"data": [[11.0, 3.9090909090909087]], "isOverall": false, "label": "39 /dwf/v1/meta/relations-delete/guanlianlei-Aggregated", "isController": false}, {"data": [[1.0, 271.0]], "isOverall": false, "label": "103 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.0, 271.0]], "isOverall": false, "label": "103 /dwf/v1/omf/entities/hopsotal/objects/count-Aggregated", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "88 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "88 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "54 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "54 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[11.0, 10.545454545454547]], "isOverall": false, "label": "28 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[11.0, 10.545454545454547]], "isOverall": false, "label": "28 /dwf/v1/meta/classes/guanlianlei/scripts-Aggregated", "isController": false}, {"data": [[11.0, 22.727272727272727]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[11.0, 22.727272727272727]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/newItemClass/scripts-Aggregated", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "81 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "81 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[11.0, 20.81818181818182]], "isOverall": false, "label": "5 /dwf/v1/org/users", "isController": false}, {"data": [[11.0, 20.81818181818182]], "isOverall": false, "label": "5 /dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[100.0, 152.57000000000002]], "isOverall": false, "label": "11/dwf/v1/org/users", "isController": false}, {"data": [[100.0, 152.57000000000002]], "isOverall": false, "label": "11/dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[1.0, 29.0], [11.0, 93.0909090909091]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes", "isController": false}, {"data": [[10.166666666666666, 87.75]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[1.0, 25.0]], "isOverall": false, "label": "60 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 25.0]], "isOverall": false, "label": "60 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "93 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "93 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "58 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 19.0]], "isOverall": false, "label": "58 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[1.0, 28.0]], "isOverall": false, "label": "102 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.0, 28.0]], "isOverall": false, "label": "102 /dwf/v1/omf/entities/hopsotal/objects/count-Aggregated", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "112 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "112 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 35.0]], "isOverall": false, "label": "119 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 35.0]], "isOverall": false, "label": "119 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 27.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.0, 27.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/hopsotal/scripts-Aggregated", "isController": false}, {"data": [[1.0, 81.0], [5.0, 77.0], [11.0, 71.16666666666667]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes", "isController": false}, {"data": [[7.909090909090908, 74.18181818181819]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.0, 14.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "89 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "89 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[1.0, 10.0], [11.0, 26.454545454545457]], "isOverall": false, "label": "3 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[10.565217391304348, 25.73913043478261]], "isOverall": false, "label": "3 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[1.0, 12.0]], "isOverall": false, "label": "31 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.0, 12.0]], "isOverall": false, "label": "31 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[1.0, 10.0], [11.0, 28.09090909090909]], "isOverall": false, "label": "16 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[10.166666666666666, 26.583333333333332]], "isOverall": false, "label": "16 /dwf/v1/meta/dbtables-Aggregated", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "64 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "64 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[11.0, 31.18181818181818]], "isOverall": false, "label": "19 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[11.0, 31.18181818181818]], "isOverall": false, "label": "19 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[1.0, 22.0]], "isOverall": false, "label": "108 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.0, 22.0]], "isOverall": false, "label": "108 /dwf/v1/omf/entities/hopsotal/objects-Aggregated", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "48 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "48 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "68 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "68 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[11.0, 12.09090909090909]], "isOverall": false, "label": "41 /删除关联类属性", "isController": false}, {"data": [[11.0, 12.09090909090909]], "isOverall": false, "label": "41 /删除关联类属性-Aggregated", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "27 /dwf/v1/meta/entities/hopsotal/attributes-bind", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "27 /dwf/v1/meta/entities/hopsotal/attributes-bind-Aggregated", "isController": false}, {"data": [[100.0, 10.150000000000004]], "isOverall": false, "label": "5/dwf/v1/org/groups/tree", "isController": false}, {"data": [[100.0, 10.150000000000004]], "isOverall": false, "label": "5/dwf/v1/org/groups/tree-Aggregated", "isController": false}, {"data": [[11.0, 89.9090909090909]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes", "isController": false}, {"data": [[11.0, 89.9090909090909]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[100.0, 33.76]], "isOverall": false, "label": "1/dwf/v1/login", "isController": false}, {"data": [[100.0, 33.76]], "isOverall": false, "label": "1/dwf/v1/login-Aggregated", "isController": false}, {"data": [[100.0, 14.38]], "isOverall": false, "label": "6/dwf/v1/org/users", "isController": false}, {"data": [[100.0, 14.38]], "isOverall": false, "label": "6/dwf/v1/org/users-Aggregated", "isController": false}, {"data": [[11.0, 5.772727272727273]], "isOverall": false, "label": "6 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[11.0, 5.772727272727273]], "isOverall": false, "label": "6 /dwf/v1/org/groups/tree-Aggregated", "isController": false}, {"data": [[11.0, 8.454545454545455]], "isOverall": false, "label": "6 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[11.0, 8.454545454545455]], "isOverall": false, "label": "6 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[11.0, 22.363636363636363]], "isOverall": false, "label": "4 /modeler-web/img/logo.599b3aa8.png", "isController": false}, {"data": [[11.0, 22.363636363636363]], "isOverall": false, "label": "4 /modeler-web/img/logo.599b3aa8.png-Aggregated", "isController": false}, {"data": [[1.0, 21.0]], "isOverall": false, "label": "77 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 21.0]], "isOverall": false, "label": "77 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[1.0, 35.0]], "isOverall": false, "label": "100 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 35.0]], "isOverall": false, "label": "100 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "41 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "41 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 26.0]], "isOverall": false, "label": "49 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 26.0]], "isOverall": false, "label": "49 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 18.0]], "isOverall": false, "label": "70 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 18.0]], "isOverall": false, "label": "70 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 39.0]], "isOverall": false, "label": "78 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 39.0]], "isOverall": false, "label": "78 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[11.0, 5.636363636363637]], "isOverall": false, "label": "24 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[11.0, 5.636363636363637]], "isOverall": false, "label": "24 /dwf/v1/meta/attributes-create-Aggregated", "isController": false}, {"data": [[1.0, 139.0]], "isOverall": false, "label": "57 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 139.0]], "isOverall": false, "label": "57 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[1.0, 25.9]], "isOverall": false, "label": "122 /实体类建表", "isController": false}, {"data": [[1.0, 25.9]], "isOverall": false, "label": "122 /实体类建表-Aggregated", "isController": false}, {"data": [[100.0, 9.139999999999995]], "isOverall": false, "label": "9/dwf/v1/org/users-create", "isController": false}, {"data": [[100.0, 9.139999999999995]], "isOverall": false, "label": "9/dwf/v1/org/users-create-Aggregated", "isController": false}, {"data": [[11.0, 5.545454545454546]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[11.0, 5.545454545454546]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/newItemClass/attributes-bind-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "52 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "52 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 42.0]], "isOverall": false, "label": "124 /删除实体类", "isController": false}, {"data": [[1.0, 42.0]], "isOverall": false, "label": "124 /删除实体类-Aggregated", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "63 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "63 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 28.0]], "isOverall": false, "label": "101 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.0, 28.0]], "isOverall": false, "label": "101 /dwf/v1/meta/resources-Aggregated", "isController": false}, {"data": [[11.0, 18.818181818181813]], "isOverall": false, "label": "24 /删除属性", "isController": false}, {"data": [[11.0, 18.818181818181813]], "isOverall": false, "label": "24 /删除属性-Aggregated", "isController": false}, {"data": [[10.0, 27.900000000000002]], "isOverall": false, "label": "3/添加用户到当前组", "isController": false}, {"data": [[10.0, 27.900000000000002]], "isOverall": false, "label": "3/添加用户到当前组-Aggregated", "isController": false}, {"data": [[1.0, 25.18181818181818]], "isOverall": false, "label": "26 /创建属性", "isController": false}, {"data": [[1.0, 25.18181818181818]], "isOverall": false, "label": "26 /创建属性-Aggregated", "isController": false}, {"data": [[11.0, 179.0]], "isOverall": false, "label": "25 /dwf/v1/meta/relations", "isController": false}, {"data": [[11.0, 179.0]], "isOverall": false, "label": "25 /dwf/v1/meta/relations-Aggregated", "isController": false}, {"data": [[100.0, 51.809999999999974]], "isOverall": false, "label": "4/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[100.0, 51.809999999999974]], "isOverall": false, "label": "4/dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[11.0, 30.0]], "isOverall": false, "label": "26 /绑定属性到类", "isController": false}, {"data": [[11.0, 30.0]], "isOverall": false, "label": "26 /绑定属性到类-Aggregated", "isController": false}, {"data": [[11.0, 17.545454545454543]], "isOverall": false, "label": "38 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[11.0, 17.545454545454543]], "isOverall": false, "label": "38 /dwf/v1/meta/relations/guanlianlei/attributes-Aggregated", "isController": false}, {"data": [[1.0, 3.0], [11.0, 7.954545454545455]], "isOverall": false, "label": "2 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[10.565217391304348, 7.739130434782609]], "isOverall": false, "label": "2 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[100.0, 83.99999999999999]], "isOverall": false, "label": "8/dwf/v1/org/groups/tree", "isController": false}, {"data": [[100.0, 83.99999999999999]], "isOverall": false, "label": "8/dwf/v1/org/groups/tree-Aggregated", "isController": false}, {"data": [[8.0, 28.5], [1.0, 36.0], [10.0, 28.0], [11.0, 20.0], [6.0, 31.0]], "isOverall": false, "label": "44 /删除实体类B", "isController": false}, {"data": [[7.090909090909091, 29.454545454545457]], "isOverall": false, "label": "44 /删除实体类B-Aggregated", "isController": false}, {"data": [[1.0, 26.0], [11.0, 27.545454545454547]], "isOverall": false, "label": "1 /dwf/v1/login", "isController": false}, {"data": [[10.565217391304348, 27.47826086956522]], "isOverall": false, "label": "1 /dwf/v1/login-Aggregated", "isController": false}, {"data": [[11.0, 85.0909090909091]], "isOverall": false, "label": "13 /dwf/v1/meta/attributes", "isController": false}, {"data": [[11.0, 85.0909090909091]], "isOverall": false, "label": "13 /dwf/v1/meta/attributes-Aggregated", "isController": false}, {"data": [[11.0, 6.363636363636363]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[11.0, 6.363636363636363]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/newItemClass/scripts-Aggregated", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "61 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "61 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[1.0, 18.0]], "isOverall": false, "label": "28 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.0, 18.0]], "isOverall": false, "label": "28 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "42 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 30.0]], "isOverall": false, "label": "42 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[11.0, 4.090909090909091]], "isOverall": false, "label": "3 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[11.0, 4.090909090909091]], "isOverall": false, "label": "3 /dwf/v1/org/groups/tree-Aggregated", "isController": false}, {"data": [[11.0, 10.272727272727273]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[11.0, 10.272727272727273]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/newItemClass/attributes-Aggregated", "isController": false}, {"data": [[11.0, 15.545454545454547]], "isOverall": false, "label": "22 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[11.0, 15.545454545454547]], "isOverall": false, "label": "22 /dwf/v1/meta/attribute-types-Aggregated", "isController": false}, {"data": [[1.0, 40.0]], "isOverall": false, "label": "82 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 40.0]], "isOverall": false, "label": "82 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "51 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 29.0]], "isOverall": false, "label": "51 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 11.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[1.0, 21.272727272727273]], "isOverall": false, "label": "123 /删除表单", "isController": false}, {"data": [[1.0, 21.272727272727273]], "isOverall": false, "label": "123 /删除表单-Aggregated", "isController": false}, {"data": [[11.0, 17.545454545454543]], "isOverall": false, "label": "16 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[11.0, 17.545454545454543]], "isOverall": false, "label": "16 /dwf/v1/org/current-user-environment-Aggregated", "isController": false}, {"data": [[1.0, 19.0], [11.0, 19.454545454545453]], "isOverall": false, "label": "8 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[10.166666666666666, 19.416666666666664]], "isOverall": false, "label": "8 /dwf/v1/org/groups/tree-Aggregated", "isController": false}, {"data": [[1.0, 42.0]], "isOverall": false, "label": "95 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 42.0]], "isOverall": false, "label": "95 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[1.0, 16.0]], "isOverall": false, "label": "98 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 16.0]], "isOverall": false, "label": "98 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[1.0, 22.0]], "isOverall": false, "label": "96 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.0, 22.0]], "isOverall": false, "label": "96 /dwf/v1/meta/entities/hopsotal/operations-Aggregated", "isController": false}, {"data": [[10.0, 15.7]], "isOverall": false, "label": "6/删除用户", "isController": false}, {"data": [[10.0, 15.7]], "isOverall": false, "label": "6/删除用户-Aggregated", "isController": false}, {"data": [[1.0, 7.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.0, 7.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-create-Aggregated", "isController": false}, {"data": [[1.0, 17.0], [11.0, 14.727272727272728]], "isOverall": false, "label": "17 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[10.166666666666666, 14.916666666666668]], "isOverall": false, "label": "17 /dwf/v1/meta/attribute-types-Aggregated", "isController": false}, {"data": [[11.0, 4.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[11.0, 4.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-create-Aggregated", "isController": false}, {"data": [[1.0, 25.0]], "isOverall": false, "label": "76 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.0, 25.0]], "isOverall": false, "label": "76 /dwf/v1/meta/entities/undefined/operations-Aggregated", "isController": false}, {"data": [[11.0, 38.727272727272734]], "isOverall": false, "label": "40 /删除关联类", "isController": false}, {"data": [[11.0, 38.727272727272734]], "isOverall": false, "label": "40 /删除关联类-Aggregated", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "105 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.0, 24.0]], "isOverall": false, "label": "105 /dwf/v1/omf/entities/hopsotal/objects/count-Aggregated", "isController": false}, {"data": [[11.0, 11.545454545454545]], "isOverall": false, "label": "23 /dwf/v1/meta/attributes-delete/crus", "isController": false}, {"data": [[11.0, 11.545454545454545]], "isOverall": false, "label": "23 /dwf/v1/meta/attributes-delete/crus-Aggregated", "isController": false}, {"data": [[11.0, 58.36363636363636]], "isOverall": false, "label": "42 /dwf/v1/meta/relations", "isController": false}, {"data": [[11.0, 58.36363636363636]], "isOverall": false, "label": "42 /dwf/v1/meta/relations-Aggregated", "isController": false}, {"data": [[11.0, 3.0]], "isOverall": false, "label": "18 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[11.0, 3.0]], "isOverall": false, "label": "18 /dwf/v1/meta/class-names-min-Aggregated", "isController": false}, {"data": [[11.0, 16.545454545454547]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[11.0, 16.545454545454547]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/newItemClass/backward-relations-Aggregated", "isController": false}, {"data": [[11.0, 5.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[11.0, 5.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/newItemClass/forward-relations-Aggregated", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "73 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.0, 9.0]], "isOverall": false, "label": "73 /dwf/v1/meta/entities-Aggregated", "isController": false}, {"data": [[11.0, 79.9090909090909]], "isOverall": false, "label": "9 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[11.0, 79.9090909090909]], "isOverall": false, "label": "9 /dwf/v1/meta/classes/IdItem/children-Aggregated", "isController": false}, {"data": [[1.0, 45.0]], "isOverall": false, "label": "19 /创建实体类", "isController": false}, {"data": [[1.0, 45.0]], "isOverall": false, "label": "19 /创建实体类-Aggregated", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "92 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.0, 10.0]], "isOverall": false, "label": "92 /dwf/v1/meta/entities/Root/operations-Aggregated", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "6 /dwf/v1/org/users", "isController": false}, {"data": [[1.0, 4.0]], "isOverall": false, "label": "6 /dwf/v1/org/users-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 44715.96666666667, "minX": 1.55204034E12, "maxY": 256314.01666666666, "series": [{"data": [[1.55204034E12, 256314.01666666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.55204034E12, 44715.96666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55204034E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.55204034E12, "maxY": 271.0, "series": [{"data": [[1.55204034E12, 29.0]], "isOverall": false, "label": "43 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "90 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 20.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 13.200000000000001]], "isOverall": false, "label": "8/获取所有用户组", "isController": false}, {"data": [[1.55204034E12, 42.17647058823529]], "isOverall": false, "label": "10 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 3.9090909090909087]], "isOverall": false, "label": "17 /dwf/v1/meta/attributes/crus", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "18 /获取属性信息", "isController": false}, {"data": [[1.55204034E12, 2.727272727272727]], "isOverall": false, "label": "21 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 27.0]], "isOverall": false, "label": "87 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 74.99999999999999]], "isOverall": false, "label": "21 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 10.272727272727273]], "isOverall": false, "label": "31 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 19.63636363636364]], "isOverall": false, "label": "20 /编辑属性", "isController": false}, {"data": [[1.55204034E12, 11.818181818181818]], "isOverall": false, "label": "35 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 8.916666666666666]], "isOverall": false, "label": "4 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 73.36363636363635]], "isOverall": false, "label": "20 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 15.772727272727275]], "isOverall": false, "label": "12 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 15.999999999999998]], "isOverall": false, "label": "5 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 26.454545454545453]], "isOverall": false, "label": "15 /新增属性", "isController": false}, {"data": [[1.55204034E12, 24.545454545454547]], "isOverall": false, "label": "1 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "18 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[1.55204034E12, 151.0]], "isOverall": false, "label": "97 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 2.0]], "isOverall": false, "label": "113 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 12.299999999999999]], "isOverall": false, "label": "5/根据条件获取用户", "isController": false}, {"data": [[1.55204034E12, 8.454545454545455]], "isOverall": false, "label": "13 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "115 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 38.0]], "isOverall": false, "label": "53 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 19.0]], "isOverall": false, "label": "44 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 64.63636363636364]], "isOverall": false, "label": "37 /删除实体类", "isController": false}, {"data": [[1.55204034E12, 75.81818181818183]], "isOverall": false, "label": "34 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "37 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 10.909090909090908]], "isOverall": false, "label": "8 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 15.0]], "isOverall": false, "label": "24 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.55204034E12, 14.129999999999999]], "isOverall": false, "label": "2/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 20.636363636363637]], "isOverall": false, "label": "22 /dwf/v1/meta/attributes/crus/bind-classes", "isController": false}, {"data": [[1.55204034E12, 17.272727272727273]], "isOverall": false, "label": "31 /编辑关联类属性", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "120 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 18.8]], "isOverall": false, "label": "2/创建新用户并添加", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "71 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[1.55204034E12, 96.26999999999997]], "isOverall": false, "label": "3/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 89.0]], "isOverall": false, "label": "38 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 10.454545454545455]], "isOverall": false, "label": "37 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[1.55204034E12, 42.0]], "isOverall": false, "label": "80 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 55.18181818181818]], "isOverall": false, "label": "12 /新增实体类A", "isController": false}, {"data": [[1.55204034E12, 24.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 19.0]], "isOverall": false, "label": "45 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "86 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 10.999999999999998]], "isOverall": false, "label": "7 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 12.727272727272727]], "isOverall": false, "label": "8 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 31.27272727272727]], "isOverall": false, "label": "28 /绑定属性到新建的实体类", "isController": false}, {"data": [[1.55204034E12, 18.090909090909093]], "isOverall": false, "label": "28 /删除实体类属性", "isController": false}, {"data": [[1.55204034E12, 39.0]], "isOverall": false, "label": "32 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 50.0]], "isOverall": false, "label": "56 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "74 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 16.304347826086957]], "isOverall": false, "label": "9 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 19.0]], "isOverall": false, "label": "65 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 15.5]], "isOverall": false, "label": "4/获取指定用户", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "36 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[1.55204034E12, 35.0]], "isOverall": false, "label": "39 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 28.0]], "isOverall": false, "label": "107 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 10.25]], "isOverall": false, "label": "7 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 43.0]], "isOverall": false, "label": "99 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "27 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 39.43478260869564]], "isOverall": false, "label": "15 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 29.0]], "isOverall": false, "label": "84 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "118 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "36 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 25.0]], "isOverall": false, "label": "75 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 77.27272727272727]], "isOverall": false, "label": "18 /新增实体类", "isController": false}, {"data": [[1.55204034E12, 37.0]], "isOverall": false, "label": "40 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 17.81818181818182]], "isOverall": false, "label": "23 /dwf/v1/meta/relations-create", "isController": false}, {"data": [[1.55204034E12, 30.0]], "isOverall": false, "label": "121 /dwf/v1/meta/class/hopsotal/views/hoij", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 60.06000000000002]], "isOverall": false, "label": "7/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "46 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 29.0]], "isOverall": false, "label": "66 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 46.0]], "isOverall": false, "label": "55 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 14.90909090909091]], "isOverall": false, "label": "26 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "21 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "106 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 17.090909090909093]], "isOverall": false, "label": "4 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "17 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "111 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "11 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[1.55204034E12, 15.0]], "isOverall": false, "label": "104 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 5.090909090909091]], "isOverall": false, "label": "32 /dwf/v1/meta/relations/guanlianlei/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 72.0909090909091]], "isOverall": false, "label": "32 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 4.666666666666667]], "isOverall": false, "label": "11 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 15.272727272727272]], "isOverall": false, "label": "25 /编辑实体类新增属性", "isController": false}, {"data": [[1.55204034E12, 25.18181818181818]], "isOverall": false, "label": "7 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 70.63636363636364]], "isOverall": false, "label": "14 /新增实体类B", "isController": false}, {"data": [[1.55204034E12, 64.27272727272727]], "isOverall": false, "label": "24 /新增关联类", "isController": false}, {"data": [[1.55204034E12, 20.4]], "isOverall": false, "label": "7/删除用户组", "isController": false}, {"data": [[1.55204034E12, 34.54545454545455]], "isOverall": false, "label": "13 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 40.800000000000004]], "isOverall": false, "label": "1/新增独立用户组", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "67 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 153.75]], "isOverall": false, "label": "10添加用户", "isController": false}, {"data": [[1.55204034E12, 38.0]], "isOverall": false, "label": "79 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 35.909090909090914]], "isOverall": false, "label": "43 /删除实体类A", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "116 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 32.0]], "isOverall": false, "label": "69 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "117 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "36 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[1.55204034E12, 1.0]], "isOverall": false, "label": "BeanShell Sampler", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "47 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 20.0]], "isOverall": false, "label": "50 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 21.0]], "isOverall": false, "label": "72 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 40.0]], "isOverall": false, "label": "83 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 18.0]], "isOverall": false, "label": "109 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 11.999999999999998]], "isOverall": false, "label": "30 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "12 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 4.454545454545454]], "isOverall": false, "label": "11 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 3.5454545454545454]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-update", "isController": false}, {"data": [[1.55204034E12, 4.909090909090909]], "isOverall": false, "label": "2 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "114 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 34.0]], "isOverall": false, "label": "59 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "91 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 96.41]], "isOverall": false, "label": "12/删除用户", "isController": false}, {"data": [[1.55204034E12, 31.54545454545454]], "isOverall": false, "label": "21 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[1.55204034E12, 22.0]], "isOverall": false, "label": "85 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 20.27272727272727]], "isOverall": false, "label": "125 /删除属性", "isController": false}, {"data": [[1.55204034E12, 9.545454545454545]], "isOverall": false, "label": "30 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 8.181818181818182]], "isOverall": false, "label": "29 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 43.18181818181819]], "isOverall": false, "label": "33 /绑定属性到类", "isController": false}, {"data": [[1.55204034E12, 26.0]], "isOverall": false, "label": "62 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 21.545454545454547]], "isOverall": false, "label": "27 /解除类与属性的绑定", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "110 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 29.0]], "isOverall": false, "label": "94 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 76.9090909090909]], "isOverall": false, "label": "16 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 3.9090909090909087]], "isOverall": false, "label": "39 /dwf/v1/meta/relations-delete/guanlianlei", "isController": false}, {"data": [[1.55204034E12, 271.0]], "isOverall": false, "label": "103 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 19.0]], "isOverall": false, "label": "88 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "54 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 10.545454545454547]], "isOverall": false, "label": "28 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[1.55204034E12, 22.727272727272727]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[1.55204034E12, 19.0]], "isOverall": false, "label": "81 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 20.81818181818182]], "isOverall": false, "label": "5 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 152.57000000000002]], "isOverall": false, "label": "11/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 87.75]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 25.0]], "isOverall": false, "label": "60 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "93 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 19.0]], "isOverall": false, "label": "58 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 28.0]], "isOverall": false, "label": "102 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 24.0]], "isOverall": false, "label": "112 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 35.0]], "isOverall": false, "label": "119 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 27.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.55204034E12, 74.18181818181819]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "89 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 25.73913043478261]], "isOverall": false, "label": "3 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "31 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 26.583333333333332]], "isOverall": false, "label": "16 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 30.0]], "isOverall": false, "label": "64 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 31.18181818181818]], "isOverall": false, "label": "19 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 22.0]], "isOverall": false, "label": "108 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "48 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 24.0]], "isOverall": false, "label": "68 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 12.09090909090909]], "isOverall": false, "label": "41 /删除关联类属性", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "27 /dwf/v1/meta/entities/hopsotal/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 10.150000000000004]], "isOverall": false, "label": "5/dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 89.9090909090909]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 33.76]], "isOverall": false, "label": "1/dwf/v1/login", "isController": false}, {"data": [[1.55204034E12, 14.38]], "isOverall": false, "label": "6/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 5.772727272727273]], "isOverall": false, "label": "6 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 8.454545454545455]], "isOverall": false, "label": "6 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 22.363636363636363]], "isOverall": false, "label": "4 /modeler-web/img/logo.599b3aa8.png", "isController": false}, {"data": [[1.55204034E12, 21.0]], "isOverall": false, "label": "77 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 35.0]], "isOverall": false, "label": "100 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 30.0]], "isOverall": false, "label": "41 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 26.0]], "isOverall": false, "label": "49 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 18.0]], "isOverall": false, "label": "70 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 39.0]], "isOverall": false, "label": "78 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 5.636363636363637]], "isOverall": false, "label": "24 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 139.0]], "isOverall": false, "label": "57 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 25.9]], "isOverall": false, "label": "122 /实体类建表", "isController": false}, {"data": [[1.55204034E12, 9.139999999999995]], "isOverall": false, "label": "9/dwf/v1/org/users-create", "isController": false}, {"data": [[1.55204034E12, 5.545454545454546]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "52 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 42.0]], "isOverall": false, "label": "124 /删除实体类", "isController": false}, {"data": [[1.55204034E12, 24.0]], "isOverall": false, "label": "63 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 28.0]], "isOverall": false, "label": "101 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 18.818181818181813]], "isOverall": false, "label": "24 /删除属性", "isController": false}, {"data": [[1.55204034E12, 27.900000000000002]], "isOverall": false, "label": "3/添加用户到当前组", "isController": false}, {"data": [[1.55204034E12, 25.18181818181818]], "isOverall": false, "label": "26 /创建属性", "isController": false}, {"data": [[1.55204034E12, 179.0]], "isOverall": false, "label": "25 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 51.809999999999974]], "isOverall": false, "label": "4/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 30.0]], "isOverall": false, "label": "26 /绑定属性到类", "isController": false}, {"data": [[1.55204034E12, 17.545454545454543]], "isOverall": false, "label": "38 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 7.739130434782609]], "isOverall": false, "label": "2 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 83.99999999999999]], "isOverall": false, "label": "8/dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 29.454545454545457]], "isOverall": false, "label": "44 /删除实体类B", "isController": false}, {"data": [[1.55204034E12, 27.47826086956522]], "isOverall": false, "label": "1 /dwf/v1/login", "isController": false}, {"data": [[1.55204034E12, 85.0909090909091]], "isOverall": false, "label": "13 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 6.363636363636363]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "61 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 18.0]], "isOverall": false, "label": "28 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 30.0]], "isOverall": false, "label": "42 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 4.090909090909091]], "isOverall": false, "label": "3 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 10.272727272727273]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 15.545454545454547]], "isOverall": false, "label": "22 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 40.0]], "isOverall": false, "label": "82 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 29.0]], "isOverall": false, "label": "51 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 21.272727272727273]], "isOverall": false, "label": "123 /删除表单", "isController": false}, {"data": [[1.55204034E12, 17.545454545454543]], "isOverall": false, "label": "16 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 19.416666666666664]], "isOverall": false, "label": "8 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 42.0]], "isOverall": false, "label": "95 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 16.0]], "isOverall": false, "label": "98 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 22.0]], "isOverall": false, "label": "96 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 15.7]], "isOverall": false, "label": "6/删除用户", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 14.916666666666668]], "isOverall": false, "label": "17 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 25.0]], "isOverall": false, "label": "76 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 38.727272727272734]], "isOverall": false, "label": "40 /删除关联类", "isController": false}, {"data": [[1.55204034E12, 24.0]], "isOverall": false, "label": "105 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 11.545454545454545]], "isOverall": false, "label": "23 /dwf/v1/meta/attributes-delete/crus", "isController": false}, {"data": [[1.55204034E12, 58.36363636363636]], "isOverall": false, "label": "42 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "18 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[1.55204034E12, 16.545454545454547]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "73 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 79.9090909090909]], "isOverall": false, "label": "9 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 45.0]], "isOverall": false, "label": "19 /创建实体类", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "92 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "6 /dwf/v1/org/users", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55204034E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 0.0, "minX": 1.55204034E12, "maxY": 247.0, "series": [{"data": [[1.55204034E12, 13.0]], "isOverall": false, "label": "43 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "90 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 11.4]], "isOverall": false, "label": "8/获取所有用户组", "isController": false}, {"data": [[1.55204034E12, 20.38235294117647]], "isOverall": false, "label": "10 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 3.9090909090909087]], "isOverall": false, "label": "17 /dwf/v1/meta/attributes/crus", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "18 /获取属性信息", "isController": false}, {"data": [[1.55204034E12, 2.727272727272727]], "isOverall": false, "label": "21 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 16.0]], "isOverall": false, "label": "87 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 31.09090909090909]], "isOverall": false, "label": "21 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 8.181818181818182]], "isOverall": false, "label": "31 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 15.727272727272727]], "isOverall": false, "label": "20 /编辑属性", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "35 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 6.833333333333333]], "isOverall": false, "label": "4 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 70.0909090909091]], "isOverall": false, "label": "20 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 15.045454545454549]], "isOverall": false, "label": "12 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 14.833333333333332]], "isOverall": false, "label": "5 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 17.0]], "isOverall": false, "label": "15 /新增属性", "isController": false}, {"data": [[1.55204034E12, 24.545454545454547]], "isOverall": false, "label": "1 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "18 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[1.55204034E12, 151.0]], "isOverall": false, "label": "97 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 2.0]], "isOverall": false, "label": "113 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 12.2]], "isOverall": false, "label": "5/根据条件获取用户", "isController": false}, {"data": [[1.55204034E12, 8.454545454545455]], "isOverall": false, "label": "13 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "115 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 28.0]], "isOverall": false, "label": "53 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 13.0]], "isOverall": false, "label": "44 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 62.45454545454545]], "isOverall": false, "label": "37 /删除实体类", "isController": false}, {"data": [[1.55204034E12, 37.09090909090909]], "isOverall": false, "label": "34 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "37 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 7.636363636363637]], "isOverall": false, "label": "8 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "24 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.55204034E12, 14.109999999999998]], "isOverall": false, "label": "2/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 15.454545454545453]], "isOverall": false, "label": "22 /dwf/v1/meta/attributes/crus/bind-classes", "isController": false}, {"data": [[1.55204034E12, 13.909090909090908]], "isOverall": false, "label": "31 /编辑关联类属性", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "120 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 17.900000000000002]], "isOverall": false, "label": "2/创建新用户并添加", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "71 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[1.55204034E12, 94.49]], "isOverall": false, "label": "3/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 89.0]], "isOverall": false, "label": "38 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "37 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[1.55204034E12, 27.0]], "isOverall": false, "label": "80 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 51.18181818181818]], "isOverall": false, "label": "12 /新增实体类A", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "45 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "86 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 9.727272727272728]], "isOverall": false, "label": "7 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "8 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 21.18181818181818]], "isOverall": false, "label": "28 /绑定属性到新建的实体类", "isController": false}, {"data": [[1.55204034E12, 11.909090909090908]], "isOverall": false, "label": "28 /删除实体类属性", "isController": false}, {"data": [[1.55204034E12, 39.0]], "isOverall": false, "label": "32 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 37.0]], "isOverall": false, "label": "56 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "74 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 13.913043478260871]], "isOverall": false, "label": "9 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "65 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "4/获取指定用户", "isController": false}, {"data": [[1.55204034E12, 5.7272727272727275]], "isOverall": false, "label": "36 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[1.55204034E12, 35.0]], "isOverall": false, "label": "39 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 15.0]], "isOverall": false, "label": "107 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 7.75]], "isOverall": false, "label": "7 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 43.0]], "isOverall": false, "label": "99 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "27 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 35.608695652173914]], "isOverall": false, "label": "15 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 17.0]], "isOverall": false, "label": "84 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "118 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "36 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 25.0]], "isOverall": false, "label": "75 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 69.27272727272727]], "isOverall": false, "label": "18 /新增实体类", "isController": false}, {"data": [[1.55204034E12, 36.0]], "isOverall": false, "label": "40 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 17.81818181818182]], "isOverall": false, "label": "23 /dwf/v1/meta/relations-create", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "121 /dwf/v1/meta/class/hopsotal/views/hoij", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 57.48999999999999]], "isOverall": false, "label": "7/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "46 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "66 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 27.0]], "isOverall": false, "label": "55 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 14.90909090909091]], "isOverall": false, "label": "26 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "21 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "106 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 10.545454545454545]], "isOverall": false, "label": "4 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "17 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "111 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "11 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "104 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 5.090909090909091]], "isOverall": false, "label": "32 /dwf/v1/meta/relations/guanlianlei/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 33.72727272727273]], "isOverall": false, "label": "32 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 4.666666666666667]], "isOverall": false, "label": "11 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 11.363636363636363]], "isOverall": false, "label": "25 /编辑实体类新增属性", "isController": false}, {"data": [[1.55204034E12, 20.454545454545453]], "isOverall": false, "label": "7 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 66.36363636363636]], "isOverall": false, "label": "14 /新增实体类B", "isController": false}, {"data": [[1.55204034E12, 61.272727272727266]], "isOverall": false, "label": "24 /新增关联类", "isController": false}, {"data": [[1.55204034E12, 19.400000000000002]], "isOverall": false, "label": "7/删除用户组", "isController": false}, {"data": [[1.55204034E12, 30.0]], "isOverall": false, "label": "13 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 38.2]], "isOverall": false, "label": "1/新增独立用户组", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "67 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 152.12999999999997]], "isOverall": false, "label": "10添加用户", "isController": false}, {"data": [[1.55204034E12, 13.0]], "isOverall": false, "label": "79 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 33.27272727272727]], "isOverall": false, "label": "43 /删除实体类A", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "116 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 32.0]], "isOverall": false, "label": "69 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "117 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "36 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "BeanShell Sampler", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "47 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "50 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "72 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 26.0]], "isOverall": false, "label": "83 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "109 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 11.999999999999998]], "isOverall": false, "label": "30 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "12 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 4.454545454545454]], "isOverall": false, "label": "11 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 3.5454545454545454]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-update", "isController": false}, {"data": [[1.55204034E12, 4.909090909090909]], "isOverall": false, "label": "2 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "114 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "59 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "91 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 94.40999999999998]], "isOverall": false, "label": "12/删除用户", "isController": false}, {"data": [[1.55204034E12, 30.727272727272723]], "isOverall": false, "label": "21 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "85 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 6.2727272727272725]], "isOverall": false, "label": "125 /删除属性", "isController": false}, {"data": [[1.55204034E12, 7.909090909090909]], "isOverall": false, "label": "30 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 6.090909090909091]], "isOverall": false, "label": "29 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 38.0]], "isOverall": false, "label": "33 /绑定属性到类", "isController": false}, {"data": [[1.55204034E12, 26.0]], "isOverall": false, "label": "62 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 18.54545454545455]], "isOverall": false, "label": "27 /解除类与属性的绑定", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "110 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 29.0]], "isOverall": false, "label": "94 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 27.272727272727273]], "isOverall": false, "label": "16 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 3.9090909090909087]], "isOverall": false, "label": "39 /dwf/v1/meta/relations-delete/guanlianlei", "isController": false}, {"data": [[1.55204034E12, 247.0]], "isOverall": false, "label": "103 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "88 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 13.0]], "isOverall": false, "label": "54 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 8.363636363636363]], "isOverall": false, "label": "28 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[1.55204034E12, 21.636363636363637]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "81 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 20.81818181818182]], "isOverall": false, "label": "5 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 135.75]], "isOverall": false, "label": "11/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 42.083333333333336]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 20.0]], "isOverall": false, "label": "60 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "93 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "58 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 28.0]], "isOverall": false, "label": "102 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 23.0]], "isOverall": false, "label": "112 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 34.0]], "isOverall": false, "label": "119 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.55204034E12, 42.45454545454546]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "89 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 22.08695652173913]], "isOverall": false, "label": "3 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "31 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 20.833333333333332]], "isOverall": false, "label": "16 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 14.0]], "isOverall": false, "label": "64 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 26.09090909090909]], "isOverall": false, "label": "19 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 13.0]], "isOverall": false, "label": "108 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "48 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "68 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 9.90909090909091]], "isOverall": false, "label": "41 /删除关联类属性", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "27 /dwf/v1/meta/entities/hopsotal/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 10.150000000000004]], "isOverall": false, "label": "5/dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 36.63636363636364]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 33.76]], "isOverall": false, "label": "1/dwf/v1/login", "isController": false}, {"data": [[1.55204034E12, 14.38]], "isOverall": false, "label": "6/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 5.772727272727273]], "isOverall": false, "label": "6 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 6.909090909090908]], "isOverall": false, "label": "6 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 17.0]], "isOverall": false, "label": "4 /modeler-web/img/logo.599b3aa8.png", "isController": false}, {"data": [[1.55204034E12, 11.0]], "isOverall": false, "label": "77 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 35.0]], "isOverall": false, "label": "100 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 12.0]], "isOverall": false, "label": "41 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "49 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "70 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 31.0]], "isOverall": false, "label": "78 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 5.636363636363637]], "isOverall": false, "label": "24 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 132.0]], "isOverall": false, "label": "57 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 19.799999999999997]], "isOverall": false, "label": "122 /实体类建表", "isController": false}, {"data": [[1.55204034E12, 9.139999999999995]], "isOverall": false, "label": "9/dwf/v1/org/users-create", "isController": false}, {"data": [[1.55204034E12, 5.545454545454546]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "52 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 23.0]], "isOverall": false, "label": "124 /删除实体类", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "63 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 28.0]], "isOverall": false, "label": "101 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 14.727272727272727]], "isOverall": false, "label": "24 /删除属性", "isController": false}, {"data": [[1.55204034E12, 19.700000000000003]], "isOverall": false, "label": "3/添加用户到当前组", "isController": false}, {"data": [[1.55204034E12, 9.818181818181818]], "isOverall": false, "label": "26 /创建属性", "isController": false}, {"data": [[1.55204034E12, 130.0]], "isOverall": false, "label": "25 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 48.769999999999996]], "isOverall": false, "label": "4/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 27.90909090909091]], "isOverall": false, "label": "26 /绑定属性到类", "isController": false}, {"data": [[1.55204034E12, 15.636363636363637]], "isOverall": false, "label": "38 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 6.2608695652173925]], "isOverall": false, "label": "2 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 81.89]], "isOverall": false, "label": "8/dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 27.727272727272727]], "isOverall": false, "label": "44 /删除实体类B", "isController": false}, {"data": [[1.55204034E12, 27.47826086956522]], "isOverall": false, "label": "1 /dwf/v1/login", "isController": false}, {"data": [[1.55204034E12, 44.63636363636364]], "isOverall": false, "label": "13 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 6.363636363636363]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[1.55204034E12, 8.0]], "isOverall": false, "label": "61 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "28 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "42 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 4.090909090909091]], "isOverall": false, "label": "3 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 8.090909090909092]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 8.90909090909091]], "isOverall": false, "label": "22 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 27.0]], "isOverall": false, "label": "82 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "51 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 9.181818181818182]], "isOverall": false, "label": "123 /删除表单", "isController": false}, {"data": [[1.55204034E12, 6.999999999999999]], "isOverall": false, "label": "16 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 17.0]], "isOverall": false, "label": "8 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 42.0]], "isOverall": false, "label": "95 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "98 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 22.0]], "isOverall": false, "label": "96 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 13.3]], "isOverall": false, "label": "6/删除用户", "isController": false}, {"data": [[1.55204034E12, 7.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 8.666666666666668]], "isOverall": false, "label": "17 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 6.0]], "isOverall": false, "label": "76 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 36.36363636363636]], "isOverall": false, "label": "40 /删除关联类", "isController": false}, {"data": [[1.55204034E12, 18.0]], "isOverall": false, "label": "105 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 11.545454545454545]], "isOverall": false, "label": "23 /dwf/v1/meta/attributes-delete/crus", "isController": false}, {"data": [[1.55204034E12, 55.18181818181818]], "isOverall": false, "label": "42 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 3.0]], "isOverall": false, "label": "18 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[1.55204034E12, 15.09090909090909]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[1.55204034E12, 5.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[1.55204034E12, 9.0]], "isOverall": false, "label": "73 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 61.90909090909091]], "isOverall": false, "label": "9 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 30.0]], "isOverall": false, "label": "19 /创建实体类", "isController": false}, {"data": [[1.55204034E12, 10.0]], "isOverall": false, "label": "92 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 4.0]], "isOverall": false, "label": "6 /dwf/v1/org/users", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55204034E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.0, "minX": 1.55204034E12, "maxY": 20.0, "series": [{"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "43 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "90 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "8/获取所有用户组", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "10 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "17 /dwf/v1/meta/attributes/crus", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "18 /获取属性信息", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "21 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "87 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "21 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "31 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "20 /编辑属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "35 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "4 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "20 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "12 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "5 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "15 /新增属性", "isController": false}, {"data": [[1.55204034E12, 18.272727272727273]], "isOverall": false, "label": "1 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "18 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[1.55204034E12, 18.0]], "isOverall": false, "label": "97 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "113 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "5/根据条件获取用户", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "13 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "115 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "53 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "44 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "37 /删除实体类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "34 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "37 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "8 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "24 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "2/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "22 /dwf/v1/meta/attributes/crus/bind-classes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "31 /编辑关联类属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "120 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "2/创建新用户并添加", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "71 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "33 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "3/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "38 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "37 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "80 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "12 /新增实体类A", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "45 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "86 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "7 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "8 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.7272727272727274]], "isOverall": false, "label": "28 /绑定属性到新建的实体类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "28 /删除实体类属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "32 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "56 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "74 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "9 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "65 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "4/获取指定用户", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "36 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "39 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "107 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "7 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "99 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "27 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "15 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "84 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "118 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/hopsotal/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "36 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "75 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "18 /新增实体类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "40 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "23 /dwf/v1/meta/relations-create", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "121 /dwf/v1/meta/class/hopsotal/views/hoij", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "7/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "46 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "66 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "55 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "26 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "21 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "106 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "4 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "17 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "111 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "11 /dwf/v1/meta/entities-create", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "104 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "32 /dwf/v1/meta/relations/guanlianlei/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "32 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "11 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "25 /编辑实体类新增属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "7 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "14 /新增实体类B", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "24 /新增关联类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "7/删除用户组", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "13 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 20.0]], "isOverall": false, "label": "1/新增独立用户组", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "67 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "10添加用户", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "79 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "43 /删除实体类A", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "116 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "69 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "117 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "36 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "BeanShell Sampler", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "47 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "50 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "72 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "83 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "109 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "30 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "12 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "11 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-update", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "2 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "114 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "59 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "91 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "12/删除用户", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "21 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "85 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "125 /删除属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "29 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "33 /绑定属性到类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "62 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "27 /解除类与属性的绑定", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "110 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "94 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "16 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "39 /dwf/v1/meta/relations-delete/guanlianlei", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "103 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "88 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "54 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "28 /dwf/v1/meta/classes/guanlianlei/scripts", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "81 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "5 /dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "11/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "60 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "93 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "58 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "102 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "112 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "119 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/hopsotal/scripts", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "89 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "3 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "31 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "16 /dwf/v1/meta/dbtables", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "64 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "19 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "108 /dwf/v1/omf/entities/hopsotal/objects", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "48 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "68 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "41 /删除关联类属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "27 /dwf/v1/meta/entities/hopsotal/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "5/dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 7.899999999999998]], "isOverall": false, "label": "1/dwf/v1/login", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "6/dwf/v1/org/users", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "6 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "6 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 7.7272727272727275]], "isOverall": false, "label": "4 /modeler-web/img/logo.599b3aa8.png", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "77 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "100 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "41 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "49 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "70 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "78 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "24 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "57 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "122 /实体类建表", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "9/dwf/v1/org/users-create", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/newItemClass/attributes-bind", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "52 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "124 /删除实体类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "63 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "101 /dwf/v1/meta/resources", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "24 /删除属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "3/添加用户到当前组", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "26 /创建属性", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "25 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "4/dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "26 /绑定属性到类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "38 /dwf/v1/meta/relations/guanlianlei/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "2 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "8/dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "44 /删除实体类B", "isController": false}, {"data": [[1.55204034E12, 18.91304347826087]], "isOverall": false, "label": "1 /dwf/v1/login", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "13 /dwf/v1/meta/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/newItemClass/scripts", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "61 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "28 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "42 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "3 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/newItemClass/attributes", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "22 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "82 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "51 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "30 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "123 /删除表单", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "16 /dwf/v1/org/current-user-environment", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "8 /dwf/v1/org/groups/tree", "isController": false}, {"data": [[1.55204034E12, 16.0]], "isOverall": false, "label": "95 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "98 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "96 /dwf/v1/meta/entities/hopsotal/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "6/删除用户", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "17 /dwf/v1/meta/attribute-types", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-create", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "76 /dwf/v1/meta/entities/undefined/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "40 /删除关联类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "105 /dwf/v1/omf/entities/hopsotal/objects/count", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "23 /dwf/v1/meta/attributes-delete/crus", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "42 /dwf/v1/meta/relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "18 /dwf/v1/meta/class-names-min", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/newItemClass/backward-relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/newItemClass/forward-relations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "73 /dwf/v1/meta/entities", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "9 /dwf/v1/meta/classes/IdItem/children", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "19 /创建实体类", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "92 /dwf/v1/meta/entities/Root/operations", "isController": false}, {"data": [[1.55204034E12, 0.0]], "isOverall": false, "label": "6 /dwf/v1/org/users", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55204034E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.55204034E12, "maxY": 314.0, "series": [{"data": [[1.55204034E12, 314.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.55204034E12, 1.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.55204034E12, 110.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.55204034E12, 217.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.55204034E12, 146.5999999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55204034E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 19.0, "minX": 2622.0, "maxY": 22.0, "series": [{"data": [[2622.0, 22.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2622.0, 19.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2622.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 8.0, "minX": 2622.0, "maxY": 18.0, "series": [{"data": [[2622.0, 18.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2622.0, 8.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2622.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 43.7, "minX": 1.55204034E12, "maxY": 43.7, "series": [{"data": [[1.55204034E12, 43.7]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55204034E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.55204034E12, "maxY": 43.666666666666664, "series": [{"data": [[1.55204034E12, 43.666666666666664]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "500", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: java.net.URISyntaxException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55204034E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.55204034E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "28 /删除实体类属性-success", "isController": false}, {"data": [[1.55204034E12, 0.5666666666666667]], "isOverall": false, "label": "10 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "85 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "37 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "75 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "41 /删除关联类属性-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "116 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "36 /dwf/v1/meta/entities/newItemClass/forward-relations-success", "isController": false}, {"data": [[1.55204034E12, 0.36666666666666664]], "isOverall": false, "label": "12 /dwf/v1/meta/attribute-types-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "97 /dwf/v1/omf/entities/hopsotal/objects/count-success", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "7 /dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.03333333333333333]], "isOverall": false, "label": "123 /删除表单-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "22 /dwf/v1/meta/attributes/crus/bind-classes-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "23 /dwf/v1/meta/attributes-delete/crus-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "27 /dwf/v1/meta/entities/hopsotal/attributes-bind-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "74 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "3/添加用户到当前组-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "26 /创建属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "39 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "7/dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "18 /获取属性信息-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "35 /dwf/v1/meta/relations/guanlianlei/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "91 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "9 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "27 /dwf/v1/meta/relations/guanlianlei/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "12 /新增实体类A-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "17 /dwf/v1/meta/relations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "33 /绑定属性到类-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "19 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "108 /dwf/v1/omf/entities/hopsotal/objects-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "33 /dwf/v1/meta/entities/newItemClass/backward-relations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "47 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "114 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "24 /删除属性-success", "isController": false}, {"data": [[1.55204034E12, 0.38333333333333336]], "isOverall": false, "label": "9 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/newItemClass/scripts-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "44 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "20 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "81 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "39 /dwf/v1/meta/relations-delete/guanlianlei-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "4/获取指定用户-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "38 /dwf/v1/meta/relations/guanlianlei/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "52 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "18 /dwf/v1/meta/class-names-min-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "36 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "18 /新增实体类-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "79 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "16 /dwf/v1/meta/dbtables-success", "isController": false}, {"data": [[1.55204034E12, 0.38333333333333336]], "isOverall": false, "label": "1 /dwf/v1/login-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "56 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "2/创建新用户并添加-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "6/删除用户-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/newItemClass/scripts-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "121 /dwf/v1/meta/class/hopsotal/views/hoij-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "21 /dwf/v1/meta/class-names-min-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "13 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "23 /dwf/v1/meta/classes/hopsotal/scripts-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "30 /dwf/v1/meta/entities/newItemClass/attributes-bind-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "6 /dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "8 /dwf/v1/org/groups/tree-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "46 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.38333333333333336]], "isOverall": false, "label": "2 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "17 /dwf/v1/meta/attribute-types-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "72 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "20 /编辑属性-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "20 /编辑属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "4 /dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "71 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "107 /dwf/v1/omf/entities/hopsotal/objects-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "30 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "7 /dwf/v1/meta/dbtables-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "21 /dwf/v1/meta/entities/newItemClass/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "4/dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-update-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "77 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "13 /dwf/v1/meta/attribute-types-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "103 /dwf/v1/omf/entities/hopsotal/objects/count-success", "isController": false}, {"data": [[1.55204034E12, 0.38333333333333336]], "isOverall": false, "label": "15 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "88 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "117 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/newItemClass/forward-relations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "32 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "24 /新增关联类-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "87 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "100 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "24 /dwf/v1/meta/entities/hopsotal/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "125 /删除属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "18 /dwf/v1/meta/entities-create-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "63 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "58 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "55 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-create-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "25 /编辑实体类新增属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "26 /dwf/v1/meta/classes/guanlianlei/scripts-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "11 /dwf/v1/meta/attribute-types-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "109 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "106 /dwf/v1/omf/entities/hopsotal/objects-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "110 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "118 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "27 /解除类与属性的绑定-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "22 /dwf/v1/meta/attribute-types-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "45 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "90 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "124 /删除实体类-failure", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "10添加用户-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "2/dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "34 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "4 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "17 /dwf/v1/meta/attributes/crus-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "37 /dwf/v1/meta/relations/guanlianlei/attributes-untie/ceshi-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "94 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "15 /新增属性-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "13 /dwf/v1/meta/dbtables-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "15 /新增属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "2 /dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "1/dwf/v1/login-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "95 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "5/dwf/v1/org/groups/tree-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "25 /编辑实体类新增属性-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "13 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "12/删除用户-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "28 /删除实体类属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "5 /dwf/v1/org/groups/tree-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "BeanShell Sampler-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "68 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.15]], "isOverall": false, "label": "123 /删除表单-success", "isController": false}, {"data": [[1.55204034E12, 0.36666666666666664]], "isOverall": false, "label": "5 /dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "16 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "59 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "101 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "11 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "31 /dwf/v1/meta/entities/newItemClass/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "70 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "120 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "48 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "21 /dwf/v1/meta/classes/hopsotal/scripts-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "98 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "80 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "23 /dwf/v1/meta/relations-create-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "67 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "34 /dwf/v1/meta/entities/newItemClass/backward-relations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "57 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "61 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "99 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "26 /创建属性-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "112 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "8/获取所有用户组-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "18 /获取属性信息-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "43 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "105 /dwf/v1/omf/entities/hopsotal/objects/count-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "6/dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "21 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "27 /解除类与属性的绑定-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "25 /dwf/v1/meta/attributes-create-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "24 /dwf/v1/meta/attributes-create-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "8/dwf/v1/org/groups/tree-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "41 /删除关联类属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "60 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "33 /绑定属性到类-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "6 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "64 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "5/根据条件获取用户-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "9/dwf/v1/org/users-create-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "115 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "24 /删除属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "24 /新增关联类-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "78 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "104 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "53 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "113 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "7 /dwf/v1/org/groups/tree-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "62 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "12 /新增实体类A-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "65 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "119 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "7/删除用户组-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "28 /dwf/v1/meta/classes/guanlianlei/scripts-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "122 /实体类建表-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "73 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "40 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "11/dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "8 /dwf/v1/org/users-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "82 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "35 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "18 /新增实体类-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "89 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "11 /dwf/v1/meta/entities-create-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "25 /dwf/v1/meta/relations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "54 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "1/新增独立用户组-success", "isController": false}, {"data": [[1.55204034E12, 0.36666666666666664]], "isOverall": false, "label": "6 /dwf/v1/org/groups/tree-success", "isController": false}, {"data": [[1.55204034E12, 0.2]], "isOverall": false, "label": "14 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "96 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "28 /绑定属性到新建的实体类-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "40 /删除关联类-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "28 /绑定属性到新建的实体类-failure", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "40 /删除关联类-success", "isController": false}, {"data": [[1.55204034E12, 1.6666666666666667]], "isOverall": false, "label": "3/dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "26 /绑定属性到类-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "93 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "84 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "26 /绑定属性到类-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "41 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "44 /删除实体类B-failure", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "44 /删除实体类B-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "30 /dwf/v1/meta/attributes-create-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "14 /新增实体类B-failure", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "32 /dwf/v1/meta/relations/guanlianlei/attributes-bind-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "51 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "14 /新增实体类B-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "1 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "66 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "69 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "83 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "38 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "31 /编辑关联类属性-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "31 /编辑关联类属性-failure", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "31 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "19 /dwf/v1/meta/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "33 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "92 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "36 /dwf/v1/meta/classes/IdItem/children-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/hopsotal/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "49 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "4 /modeler-web/img/logo.599b3aa8.png-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "16 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "22 /dwf/v1/meta/entities/newItemClass/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "29 /dwf/v1/meta/entities/newItemClass/attributes-bind-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "20 /dwf/v1/meta/relations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "12 /dwf/v1/meta/dbtables-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "76 /dwf/v1/meta/entities/undefined/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "32 /dwf/v1/meta/resources-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "50 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "8 /dwf/v1/meta/attribute-types-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "43 /删除实体类A-failure", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "43 /删除实体类A-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "42 /dwf/v1/meta/relations-success", "isController": false}, {"data": [[1.55204034E12, 0.16666666666666666]], "isOverall": false, "label": "37 /删除实体类-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "42 /dwf/v1/meta/entities/Root/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "3 /dwf/v1/org/groups/tree-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "86 /dwf/v1/meta/entities-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "19 /创建实体类-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "28 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.18333333333333332]], "isOverall": false, "label": "29 /dwf/v1/meta/relations/guanlianlei/attributes-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "102 /dwf/v1/omf/entities/hopsotal/objects/count-success", "isController": false}, {"data": [[1.55204034E12, 0.38333333333333336]], "isOverall": false, "label": "3 /dwf/v1/org/current-user-environment-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "111 /dwf/v1/meta/entities/hopsotal/operations-success", "isController": false}, {"data": [[1.55204034E12, 0.016666666666666666]], "isOverall": false, "label": "37 /删除实体类-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55204034E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}