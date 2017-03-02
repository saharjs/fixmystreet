var fixmystreet = fixmystreet || {};

(function() {

    fixmystreet.maps = {
      // This function might be passed either an OpenLayers.LonLat (so has
      // lon and lat), or an OpenLayers.Geometry.Point (so has x and y).
      update_pin: function(lonlat) {
        var transformedLonlat = lonlat.clone().transform(
            fixmystreet.map.getProjectionObject(),
            new OpenLayers.Projection("EPSG:4326")
        );

        var lat = transformedLonlat.lat || transformedLonlat.y;
        var lon = transformedLonlat.lon || transformedLonlat.x;

        document.getElementById('fixmystreet.latitude').value = lat;
        document.getElementById('fixmystreet.longitude').value = lon;
        return {
            'url': { 'lon': lon, 'lat': lat },
            'state': { 'lon': lonlat.lon, 'lat': lonlat.lat }
        };
      },

      display_around: function() {
        // Required after changing the size of the map element
        fixmystreet.map.updateSize();

        // Dragging the map should fetch new local reports from server
        if (fixmystreet.bbox_strategy) {
            fixmystreet.bbox_strategy.activate();
        }

        // Should not be able to drag normal pins!!
        drag.deactivate();

        // Force a redraw to return (de)selected marker to normal size
        // Redraw for all pages, kick off a refresh too for around
        // TODO Put 'new report' pin in different layer to simplify this and elsewhere
        fixmystreet.maps.markers_resize();
        fixmystreet.markers.refresh({force: true});
      },

      begin_report: function(lonlat) {
        if (typeof lonlat.clone !== 'function') {
            lonlat = new OpenLayers.LonLat(lonlat.lon, lonlat.lat);
        }

        if (fixmystreet.page == 'new') {
            /* Already have a pin */
            fixmystreet.markers.features[0].move(lonlat);
        } else {
            var markers = fixmystreet.maps.markers_list( [ [ lonlat.lat, lonlat.lon, 'green' ] ], false );
            fixmystreet.bbox_strategy.deactivate();
            fixmystreet.markers.removeAllFeatures();
            fixmystreet.markers.addFeatures( markers );
            drag.activate();
        }

        // check to see if markers are visible. We click the
        // link so that it updates the text in case they go
        // back
        if ( ! fixmystreet.markers.getVisibility() ) {
            $('#hide_pins_link').click();
        }
        return lonlat;
      },

      markers_list: function(pins, transform) {
        var markers = [];
        var size = fixmystreet.maps.marker_size_for_zoom(
            fixmystreet.map.getZoom() + fixmystreet.zoomOffset
        );
        var selected_size = fixmystreet.maps.selected_marker_size_for_zoom(
            fixmystreet.map.getZoom() + fixmystreet.zoomOffset
        );
        for (var i=0; i<pins.length; i++) {
            var pin = pins[i];
            var loc = new OpenLayers.Geometry.Point(pin[1], pin[0]);
            if (transform) {
                // The Strategy does this for us, so don't do it in that case.
                loc.transform(
                    new OpenLayers.Projection("EPSG:4326"),
                    fixmystreet.map.getProjectionObject()
                );
            }
            var marker_size = (pin[3] === window.selected_problem_id) ? selected_size : size;
            var marker = new OpenLayers.Feature.Vector(loc, {
                colour: pin[2],
                size: pin[5] || marker_size,
                faded: 0,
                id: pin[3],
                title: pin[4] || '',
                draggable: pin[6] === false ? false : true
            });
            markers.push( marker );
        }
        return markers;
      },

      markers_resize: function() {
        var size = fixmystreet.maps.marker_size_for_zoom(
            fixmystreet.map.getZoom() + fixmystreet.zoomOffset
        );
        var selected_size = fixmystreet.maps.selected_marker_size_for_zoom(
            fixmystreet.map.getZoom() + fixmystreet.zoomOffset
        );
        for (var i = 0; i < fixmystreet.markers.features.length; i++) {
            if (fixmystreet.markers.features[i].attributes.id == window.selected_problem_id) {
                fixmystreet.markers.features[i].attributes.size = selected_size;
            } else {
                fixmystreet.markers.features[i].attributes.size = size;
            }
        }
        fixmystreet.markers.redraw();
      },

      shortlist_multiple: function(ids, token, callback) {
        $.post("/my/planned/change_multiple", { ids: ids, token: token })
        .done(function() {
          var $itemList = $('.item-list'),
              items = [];
          $('.shortlisted-status').remove();

          for (var i = 0; i < ids.length; i++) {
            var problemId = ids[i],
                $item = $itemList.find('#report-'+ problemId)
                $form = $item.find('form'),
                $submit = $form.find("input[type='submit']" );

            $item.attr('data-lastupdate', new Date().toISOString());

            $submit.attr('name', 'shortlist-remove')
                   .attr('aria-label', $submit.data('label-remove'))
                   .removeClass('item-list__item__shortlist-add')
                   .addClass('item-list__item__shortlist-remove');
            items.push({
              'url': '/report/' + $item.data('report-id'),
              'lastupdate': $item.data('lastupdate')
            });
            callback();
          }
          $(document).trigger('shortlist-all', { items: items});
        })
        .fail(function(response) {
          if (response.status == 400) {
            // If the response is 400, then get a new CSRF token and retry
            var csrf = response.responseText.match(/name="token" value="([^"]*)"/)[1];
            fixmystreet.maps.shortlist_multiple(ids, csrf);
          } else {
            alert("We appear to be having problems. Please try again later.")
          }
        });
      },

      show_shortlist_control: function() {
        var $shortlistButton = $('#fms_shortlist_all');
        if ($shortlistButton === undefined || fixmystreet.page != "reports" ) return;

        if (fixmystreet.map.getZoom() >= 14) {
          $shortlistButton.removeClass('hidden');
          $shortlistButton.on('click', function() {
            var features = [];
            var csrf = $('meta[name="csrf-token"]').attr('content');

            for (var i = 0; i < fixmystreet.markers.features.length; i++) {
              var feature = fixmystreet.markers.features[i];
              if (feature.onScreen()) {
                features.push(feature.data.id);
              }
            }

            fixmystreet.maps.shortlist_multiple(features, csrf, function() {
              $shortlistButton.addClass('hidden');
            });
          });
        } else {
          $shortlistButton.addClass('hidden');
        }
      },

      get_marker_by_id: function(problem_id) {
        return fixmystreet.markers.getFeaturesByAttribute('id', problem_id)[0];
      },

      marker_size_for_zoom: function(zoom) {
        if (zoom >= 15) {
            return window.selected_problem_id ? 'small' : 'normal';
        } else if (zoom >= 13) {
            return window.selected_problem_id ? 'mini' : 'small';
        } else {
            return 'mini';
        }
      },

      selected_marker_size_for_zoom: function(zoom) {
        if (zoom >= 15) {
            return 'big';
        } else if (zoom >= 13) {
            return 'normal';
        } else {
            return 'small';
        }
      },

      // Handle a single report pin being moved by dragging it on the map.
      // pin_moved_callback is called with a new EPSG:4326 OpenLayers.LonLat if
      // the user drags the pin and confirms its new location.
      admin_drag: function(pin_moved_callback, confirm_change) {
          confirm_change = confirm_change || false;
          var original_lonlat;
          var drag = new OpenLayers.Control.DragFeatureFMS( fixmystreet.markers, {
              onStart: function(feature, e) {
                  // Keep track of where the feature started, so we can put it
                  // back if the user cancels the operation.
                  original_lonlat = new OpenLayers.LonLat(feature.geometry.x, feature.geometry.y);
              },
              onComplete: function(feature, e) {
                  var lonlat = feature.geometry.clone();
                  lonlat.transform(
                      fixmystreet.map.getProjectionObject(),
                      new OpenLayers.Projection("EPSG:4326")
                  );
                  if ((confirm_change && window.confirm(translation_strings.correct_position)) || !confirm_change) {
                      // Let the callback know about the newly confirmed position
                      pin_moved_callback(lonlat);
                  } else {
                      // Put it back
                      fixmystreet.markers.features[0].move(original_lonlat);
                  }
              }
          } );
          fixmystreet.map.addControl( drag );
          drag.activate();
      },

      // `markers.redraw()` in markers_highlight will trigger an
      // `overFeature` event if the mouse cursor is still over the same
      // marker on the map, which would then run markers_highlight
      // again, causing an infinite flicker while the cursor remains over
      // the same marker. We really only want to redraw the markers when
      // the cursor moves from one marker to another (ie: when there is an
      // overFeature followed by an outFeature followed by an overFeature).
      // Therefore, we keep track of the previous event in
      // fixmystreet.latest_map_hover_event and only call markers_highlight
      // if we know the previous event was different to the current one.
      // (See the `overFeature` and `outFeature` callbacks inside of
      // fixmystreet.select_feature).

      markers_highlight: function(problem_id) {
          for (var i = 0; i < fixmystreet.markers.features.length; i++) {
              if (typeof problem_id == 'undefined') {
                  // There is no highlighted marker, so unfade this marker
                  fixmystreet.markers.features[i].attributes.faded = 0;
              } else if (problem_id == fixmystreet.markers.features[i].attributes.id) {
                  // This is the highlighted marker, unfade it
                  fixmystreet.markers.features[i].attributes.faded = 0;
              } else {
                  // This is not the hightlighted marker, fade it
                  fixmystreet.markers.features[i].attributes.faded = 1;
              }
          }
          fixmystreet.markers.redraw();
      }
    };

    var drag = {
        activate: function() {
            this._drag = new OpenLayers.Control.DragFeatureFMS( fixmystreet.markers, {
                onComplete: function(feature, e) {
                    fixmystreet.update_pin( feature.geometry );
                }
            } );
            fixmystreet.map.addControl( this._drag );
            this._drag.activate();
        },
        deactivate: function() {
            this._drag && this._drag.deactivate();
        }
    };

    function zoomToBounds(bounds) {
        if (!bounds) { return; }
        var center = bounds.getCenterLonLat();
        var z = fixmystreet.map.getZoomForExtent(bounds);
        if ( z < 13 && $('html').hasClass('mobile') ) {
            z = 13;
        }
        fixmystreet.map.setCenter(center, z);
    }

    function sidebar_highlight(problem_id) {
        if (typeof problem_id !== 'undefined') {
            var $a = $('.item-list--reports a[href$="/' + problem_id + '"]');
            $a.parent().addClass('hovered');
        } else {
            $('.item-list--reports .hovered').removeClass('hovered');
        }
    }

    function marker_click(problem_id, evt) {
        var $a = $('.item-list--reports a[href$="/' + problem_id + '"]');
        if (!$a[0]) {
            return;
        }

        // All of this, just so that ctrl/cmd-click on a pin works?!
        var event;
        if (typeof window.MouseEvent === 'function') {
            event = new MouseEvent('click', evt);
            $a[0].dispatchEvent(event);
        } else if (document.createEvent) {
            event = document.createEvent("MouseEvents");
            event.initMouseEvent(
                'click', true, true, window, 1,
                0, 0, 0, 0,
                evt.ctrlKey, evt.altKey, evt.shiftKey, evt.metaKey,
                0, null);
            $a[0].dispatchEvent(event);
        } else if (document.createEventObject) {
            event = document.createEventObject();
            event.metaKey = evt.metaKey;
            event.ctrlKey = evt.ctrlKey;
            if (event.metaKey === undefined) {
                event.metaKey = event.ctrlKey;
            }
            $a[0].fireEvent("onclick", event);
        } else {
            $a[0].click();
        }
    }

    function categories_or_status_changed() {
        // If the category or status has changed we need to re-fetch map markers
        fixmystreet.markers.refresh({force: true});
    }

    function parse_query_string() {
        var qs = {};
        if (!location.search) {
            return qs;
        }
        location.search.substring(1).split('&').forEach(function(i) {
            var s = i.split('='),
                k = s[0],
                v = s[1] && decodeURIComponent(s[1].replace(/\+/g, ' '));
            qs[k] = v;
        });
        return qs;
    }

    function replace_query_parameter(qs, id, key) {
        var value = $('#' + id).val();
        if (value) {
            qs[key] = (typeof value === 'string') ? value : value.join(',');
        } else {
            delete qs[key];
        }
        return value;
    }

    function categories_or_status_changed_history() {
        if (!('pushState' in history)) {
            return;
        }
        var qs = parse_query_string();
        var filter_categories = replace_query_parameter(qs, 'filter_categories', 'filter_category');
        var filter_statuses = replace_query_parameter(qs, 'statuses', 'status');
        var sort_key = replace_query_parameter(qs, 'sort', 'sort');
        delete qs['p'];
        var new_url;
        if ($.isEmptyObject(qs)) {
            new_url = location.href.replace(location.search, "");
        } else if (location.search) {
            new_url = location.href.replace(location.search, '?' + $.param(qs));
        } else {
            new_url = location.href + '?' + $.param(qs);
        }
        history.pushState({
            filter_change: { 'filter_categories': filter_categories, 'statuses': filter_statuses, 'sort': sort_key }
        }, null, new_url);
    }

    function setup_inspector_marker_drag() {
        // On the 'inspect report' page the pin is draggable, so we need to
        // update the easting/northing fields when it's dragged.
        if (!$('form#report_inspect_form').length) {
            // Not actually on the inspect report page
            return;
        }
        fixmystreet.maps.admin_drag(function(lonlat) {
            var bng = lonlat.clone().transform(
                new OpenLayers.Projection("EPSG:4326"),
                new OpenLayers.Projection("EPSG:27700") // TODO: Handle other projections
            );
            $("#problem_northing").text(bng.y.toFixed(1));
            $("#problem_easting").text(bng.x.toFixed(1));
            $("form#report_inspect_form input[name=latitude]").val(lonlat.y);
            $("form#report_inspect_form input[name=longitude]").val(lonlat.x);
        },
        false);
    }

    function onload() {
        if ( fixmystreet.area.length ) {
            var extent = new OpenLayers.Bounds();
            var lr = new OpenLayers.Geometry.LinearRing([
                new OpenLayers.Geometry.Point(20E6,20E6),
                new OpenLayers.Geometry.Point(10E6,20E6),
                new OpenLayers.Geometry.Point(0,20E6),
                new OpenLayers.Geometry.Point(-10E6,20E6),
                new OpenLayers.Geometry.Point(-20E6,20E6),
                new OpenLayers.Geometry.Point(-20E6,0),
                new OpenLayers.Geometry.Point(-20E6,-20E6),
                new OpenLayers.Geometry.Point(-10E6,-20E6),
                new OpenLayers.Geometry.Point(0,-20E6),
                new OpenLayers.Geometry.Point(10E6,-20E6),
                new OpenLayers.Geometry.Point(20E6,-20E6),
                new OpenLayers.Geometry.Point(20E6,0)
            ]);
            var loaded = 0;
            var new_geometry = new OpenLayers.Geometry.Polygon(lr);
            for (var i=0; i<fixmystreet.area.length; i++) {
                var area = new OpenLayers.Layer.Vector("KML", {
                    renderers: ['SVGBig', 'VML', 'Canvas'],
                    strategies: [ new OpenLayers.Strategy.Fixed() ],
                    protocol: new OpenLayers.Protocol.HTTP({
                        url: "/mapit/area/" + fixmystreet.area[i] + ".kml?simplify_tolerance=0.0001",
                        format: new OpenLayers.Format.KML()
                    })
                });
                fixmystreet.map.addLayer(area);
                area.events.register('loadend', area, function(a,b,c) {
                    loaded++;
                    var style = this.styleMap.styles['default'];
                    if ( fixmystreet.area_format ) {
                        style.defaultStyle = fixmystreet.area_format;
                    } else {
                        $.extend(style.defaultStyle, { fillColor: 'black', strokeColor: 'black' });
                    }
                    var geometry = this.features[0].geometry;
                    if (geometry.CLASS_NAME == 'OpenLayers.Geometry.Collection') {
                        $.each(geometry.components, function(i, polygon) {
                            new_geometry.addComponents(polygon.components)
                            extent.extend(polygon.getBounds());
                        });
                    } else if (geometry.CLASS_NAME == 'OpenLayers.Geometry.Polygon') {
                        new_geometry.addComponents(geometry.components);
                        extent.extend(this.getDataExtent());
                    }
                    if (loaded == fixmystreet.area.length) {
                        var f = this.features[0].clone();
                        f.geometry = new_geometry;
                        this.removeAllFeatures();
                        this.addFeatures([f]);
                        zoomToBounds(extent);
                    } else {
                        fixmystreet.map.removeLayer(this);
                    }
                });
            }
        }

        var pin_layer_style_map = new OpenLayers.StyleMap({
            'default': new OpenLayers.Style({
                graphicTitle: "${title}",
                graphicOpacity: 1,
                graphicZIndex: 11,
                backgroundGraphicZIndex: 10
            })
        });
        pin_layer_style_map.addUniqueValueRules('default', 'size', {
            'normal': {
                externalGraphic: fixmystreet.pin_prefix + "pin-${colour}.png",
                graphicWidth: 48,
                graphicHeight: 64,
                graphicXOffset: -24,
                graphicYOffset: -64,
                backgroundGraphic: fixmystreet.pin_prefix + "pin-shadow.png",
                backgroundWidth: 60,
                backgroundHeight: 30,
                backgroundXOffset: -7,
                backgroundYOffset: -30,
                popupYOffset: -40
            },
            'big': {
                externalGraphic: fixmystreet.pin_prefix + "pin-${colour}-big.png",
                graphicWidth: 78,
                graphicHeight: 105,
                graphicXOffset: -39,
                graphicYOffset: -105,
                backgroundGraphic: fixmystreet.pin_prefix + "pin-shadow-big.png",
                backgroundWidth: 88,
                backgroundHeight: 40,
                backgroundXOffset: -10,
                backgroundYOffset: -35
            },
            'small': {
                externalGraphic: fixmystreet.pin_prefix + "pin-${colour}-small.png",
                graphicWidth: 24,
                graphicHeight: 32,
                graphicXOffset: -12,
                graphicYOffset: -32,
                backgroundGraphic: fixmystreet.pin_prefix + "pin-shadow-small.png",
                backgroundWidth: 30,
                backgroundHeight: 15,
                backgroundXOffset: -4,
                backgroundYOffset: -15,
                popupYOffset: -20
            },
            'mini': {
                externalGraphic: fixmystreet.pin_prefix + "pin-${colour}-mini.png",
                graphicWidth: 16,
                graphicHeight: 20,
                graphicXOffset: -8,
                graphicYOffset: -20,
                popupYOffset: -10
            }
        });
        pin_layer_style_map.addUniqueValueRules('default', 'faded', {
            0: {
                graphicOpacity: 1
            },
            1: {
                graphicOpacity: 0.4
            }
        });
        var pin_layer_options = {
            rendererOptions: {
                yOrdering: true
            },
            styleMap: pin_layer_style_map
        };
        if (fixmystreet.page == 'around') {
            fixmystreet.bbox_strategy = fixmystreet.bbox_strategy || new OpenLayers.Strategy.FixMyStreet();
            pin_layer_options.strategies = [ fixmystreet.bbox_strategy ];
            pin_layer_options.protocol = new OpenLayers.Protocol.FixMyStreet({
                url: '/ajax',
                params: fixmystreet.all_pins ? { all_pins: 1 } : { },
                format: new OpenLayers.Format.FixMyStreet()
            });
        }
        if (fixmystreet.page == 'reports' || fixmystreet.page == 'my') {
            pin_layer_options.strategies = [ new OpenLayers.Strategy.FixMyStreetFixed() ];
            pin_layer_options.protocol = new OpenLayers.Protocol.FixMyStreet({
                url: fixmystreet.original.href.split('?')[0] + '?ajax=1',
                format: new OpenLayers.Format.FixMyStreet()
            });
        }
        fixmystreet.markers = new OpenLayers.Layer.Vector("Pins", pin_layer_options);
        fixmystreet.markers.events.register( 'loadend', fixmystreet.markers, function(evt) {
            if (fixmystreet.map.popups.length) {
                fixmystreet.map.removePopup(fixmystreet.map.popups[0]);
            }
        });

        var markers = fixmystreet.maps.markers_list( fixmystreet.pins, true );
        fixmystreet.markers.addFeatures( markers );

        if (fixmystreet.page == 'around' || fixmystreet.page == 'reports' || fixmystreet.page == 'my') {
            fixmystreet.select_feature = new OpenLayers.Control.SelectFeature(
                fixmystreet.markers,
                {
                    hover: true,
                    // Override clickFeature so that we can use it even though
                    // hover is true. http://gis.stackexchange.com/a/155675
                    clickFeature: function (feature) {
                        marker_click(feature.attributes.id, this.handlers.feature.evt);
                    },
                    overFeature: function (feature) {
                        if (fixmystreet.latest_map_hover_event != 'overFeature') {
                            document.getElementById('map').style.cursor = 'pointer';
                            fixmystreet.maps.markers_highlight(feature.attributes.id);
                            sidebar_highlight(feature.attributes.id);
                            fixmystreet.latest_map_hover_event = 'overFeature';
                        }
                    },
                    outFeature: function (feature) {
                        if (fixmystreet.latest_map_hover_event != 'outFeature') {
                            document.getElementById('map').style.cursor = '';
                            fixmystreet.maps.markers_highlight();
                            sidebar_highlight();
                            fixmystreet.latest_map_hover_event = 'outFeature';
                        }
                    }
                }
            );
            fixmystreet.map.addControl( fixmystreet.select_feature );
            fixmystreet.select_feature.activate();
            fixmystreet.map.events.register( 'zoomend', null, fixmystreet.maps.markers_resize );
            fixmystreet.map.events.register( 'zoomend', null, fixmystreet.maps.show_shortlist_control );

            // Set up the event handlers to populate the filters and react to them changing
            $("#filter_categories").on("change.filters", categories_or_status_changed);
            $("#statuses").on("change.filters", categories_or_status_changed);
            $("#sort").on("change.filters", categories_or_status_changed);
            $("#filter_categories").on("change.user", categories_or_status_changed_history);
            $("#statuses").on("change.user", categories_or_status_changed_history);
            $("#sort").on("change.user", categories_or_status_changed_history);
        } else if (fixmystreet.page == 'new') {
            drag.activate();
        }
        fixmystreet.map.addLayer(fixmystreet.markers);

        if (fixmystreet.page == "report") {
            setup_inspector_marker_drag();
        }

        if ( fixmystreet.zoomToBounds ) {
            zoomToBounds( fixmystreet.markers.getDataExtent() );
        }

        $('#hide_pins_link').click(function(e) {
            e.preventDefault();
            var showhide = [
                'Show pins', 'Hide pins',
                'Dangos pinnau', 'Cuddio pinnau',
                "Vis nåler", "Skjul nåler",
                "Zeige Stecknadeln", "Stecknadeln ausblenden"
            ];
            for (var i=0; i<showhide.length; i+=2) {
                if (this.innerHTML == showhide[i]) {
                    fixmystreet.markers.setVisibility(true);
                    fixmystreet.select_feature.activate();
                    this.innerHTML = showhide[i+1];
                } else if (this.innerHTML == showhide[i+1]) {
                    fixmystreet.markers.setVisibility(false);
                    fixmystreet.select_feature.deactivate();
                    this.innerHTML = showhide[i];
                }
            }
        });

        $('#all_pins_link').click(function(e) {
            e.preventDefault();
            fixmystreet.markers.setVisibility(true);
            var texts = [
                'en', 'Show old', 'Hide old',
                'nb', 'Vis gamle', 'Skjul gamle',
                'cy', 'Cynnwys hen adroddiadau', 'Cuddio hen adroddiadau'
            ];
            for (var i=0; i<texts.length; i+=3) {
                if (this.innerHTML == texts[i+1]) {
                    this.innerHTML = texts[i+2];
                    fixmystreet.markers.protocol.options.params = { all_pins: 1 };
                    fixmystreet.markers.refresh( { force: true } );
                    lang = texts[i];
                } else if (this.innerHTML == texts[i+2]) {
                    this.innerHTML = texts[i+1];
                    fixmystreet.markers.protocol.options.params = { };
                    fixmystreet.markers.refresh( { force: true } );
                    lang = texts[i];
                }
            }
            if (lang == 'cy') {
                document.getElementById('hide_pins_link').innerHTML = 'Cuddio pinnau';
            } else if (lang == 'nb') {
                document.getElementById('hide_pins_link').innerHTML = 'Skjul nåler';
            } else {
                document.getElementById('hide_pins_link').innerHTML = 'Hide pins';
            }
        });

    }

    $(function(){

        // Set specific map config - some other JS included in the
        // template should define this
        fixmystreet.maps.config();

        // Create the basics of the map
        fixmystreet.map = new OpenLayers.Map(
            "map", OpenLayers.Util.extend({
                theme: null,
                controls: fixmystreet.controls,
                displayProjection: new OpenLayers.Projection("EPSG:4326")
            }, fixmystreet.map_options)
        );

        // Set it up our way

        var layer;
        if (!fixmystreet.layer_options) {
            fixmystreet.layer_options = [ {} ];
        }
        if (!fixmystreet.layer_name) {
            fixmystreet.layer_name = "";
        }
        for (var i=0; i<fixmystreet.layer_options.length; i++) {
            fixmystreet.layer_options[i] = OpenLayers.Util.extend({
                // This option is used by XYZ-based layers
                zoomOffset: fixmystreet.zoomOffset,
                // This option is used by FixedZoomLevels-based layers
                minZoomLevel: fixmystreet.zoomOffset,
                // This option is thankfully used by them both
                numZoomLevels: fixmystreet.numZoomLevels
            }, fixmystreet.layer_options[i]);
            if (fixmystreet.layer_options[i].matrixIds) {
                layer = new fixmystreet.map_type(fixmystreet.layer_options[i]);
            } else {
                layer = new fixmystreet.map_type(fixmystreet.layer_name, fixmystreet.layer_options[i]);
            }
            fixmystreet.map.addLayer(layer);
        }

        if (!fixmystreet.map.getCenter()) {
            var centre = new OpenLayers.LonLat( fixmystreet.longitude, fixmystreet.latitude );
            centre.transform(
                new OpenLayers.Projection("EPSG:4326"),
                fixmystreet.map.getProjectionObject()
            );
            fixmystreet.map.setCenter(centre, fixmystreet.zoom || 3);
        }

        if (document.getElementById('mapForm')) {
            var click = new OpenLayers.Control.Click();
            fixmystreet.map.addControl(click);
            click.activate();
        }

        // Vector layers must be added onload as IE sucks
        if ($.browser.msie) {
            $(window).load(onload);
        } else {
            onload();
        }

        (function() {
            var timeout;
            $('.item-list--reports').on('mouseenter', '.item-list--reports__item', function(){
                var href = $('a', this).attr('href');
                var id = parseInt(href.replace(/^.*[/]([0-9]+)$/, '$1'));
                clearTimeout(timeout);
                fixmystreet.maps.markers_highlight(id);
            }).on('mouseleave', '.item-list--reports__item', function(){
                timeout = setTimeout(fixmystreet.maps.markers_highlight, 50);
            });
        })();
    });

// End maps closure
})();


/* Overridding the buttonDown function of PanZoom so that it does
   zoomTo(0) rather than zoomToMaxExtent()
*/
OpenLayers.Control.PanZoomFMS = OpenLayers.Class(OpenLayers.Control.PanZoom, {
    _addButton: function(id1, id2) {
        var btn = document.createElement('div'),
            id = id1 + id2;
        btn.innerHTML = id1 + ' ' + id2;
        btn.id = this.id + "_" + id;
        btn.action = id;
        btn.className = "olButton";
        this.div.appendChild(btn);
        if (OpenLayers.VERSION_NUMBER.indexOf('2.11') > -1) {
            btn.map = this.map;
            OpenLayers.Event.observe(btn, "mousedown", OpenLayers.Function.bindAsEventListener(this.buttonDown, btn));
            var slideFactorPixels = this.slideFactor;
            btn.getSlideFactor = function() {
                return slideFactorPixels;
            };
        }
        this.buttons.push(btn);
        return btn;
    },
    moveTo: function(){},
    draw: function(px) {
        // A customised version of .draw() that doesn't specify
        // and dimensions/positions for the buttons, since we
        // size and position them all using CSS.
        OpenLayers.Control.prototype.draw.apply(this, arguments);
        this.buttons = [];
        this._addButton("pan", "up");
        this._addButton("pan", "left");
        this._addButton("pan", "right");
        this._addButton("pan", "down");
        this._addButton("zoom", "in");
        this._addButton("zoom", "out");
        return this.div;
    }
});

/* Overriding Permalink so that it can pass the correct zoom to OSM */
OpenLayers.Control.PermalinkFMS = OpenLayers.Class(OpenLayers.Control.Permalink, {
    _updateLink: function(alter_zoom) {
        var separator = this.anchor ? '#' : '?';
        var href = this.base;
        if (href.indexOf(separator) != -1) {
            href = href.substring( 0, href.indexOf(separator) );
        }

        var center = this.map.getCenter();

        var zoom = this.map.getZoom();
        if ( alter_zoom ) {
            zoom += fixmystreet.zoomOffset;
        }
        href += separator + OpenLayers.Util.getParameterString(this.createParams(center, zoom));
        // Could use mlat/mlon here as well if we are on a page with a marker
        if (this.anchor && !this.element) {
            window.location.href = href;
        }
        else {
            this.element.href = href;
        }
    },
    updateLink: function() {
        this._updateLink(0);
    }
});
OpenLayers.Control.PermalinkFMSz = OpenLayers.Class(OpenLayers.Control.PermalinkFMS, {
    updateLink: function() {
        this._updateLink(1);
    }
});

OpenLayers.Strategy.FixMyStreet = OpenLayers.Class(OpenLayers.Strategy.BBOX, {
    ratio: 1,
    // The transform in Strategy.BBOX's getMapBounds could mean you end up with
    // co-ordinates too precise, which could then cause the Strategy to think
    // it needs to update when it doesn't. So create a new bounds out of the
    // provided one to make sure it's passed through toFloat().
    getMapBounds: function() {
        var bounds = OpenLayers.Strategy.BBOX.prototype.getMapBounds.apply(this);
        if (bounds) {
            bounds = new OpenLayers.Bounds(bounds.toArray());
        }
        return bounds;
    },
    // The above isn't enough, however, because Strategy.BBOX's getMapBounds
    // and calculateBounds work out the bounds in different ways, the former by
    // transforming the map's extent to the layer projection, the latter by
    // adding or subtracting from the centre. As we have a ratio of 1, rounding
    // errors can still occur. This override makes calculateBounds always equal
    // getMapBounds (so no movement means no update).
    calculateBounds: function(mapBounds) {
        if (!mapBounds) {
            mapBounds = this.getMapBounds();
        }
        this.bounds = mapBounds;
    }
});

/* Copy of Strategy.Fixed, but with no initial load */
OpenLayers.Strategy.FixMyStreetFixed = OpenLayers.Class(OpenLayers.Strategy.Fixed, {
    activate: function() {
        var activated = OpenLayers.Strategy.prototype.activate.apply(this, arguments);
        if (activated) {
            this.layer.events.on({
                "refresh": this.load,
                scope: this
            });
        }
        return activated;
    }
});

/* Pan data request handler */
// This class is used to get a JSON object from /ajax that contains
// pins for the map and HTML for the sidebar. It does a fetch whenever the map
// is dragged (modulo a buffer extending outside the viewport).
// This subclass is required so we can pass the 'filter_category' and 'status' query
// params to /ajax if the user has filtered the map.
OpenLayers.Protocol.FixMyStreet = OpenLayers.Class(OpenLayers.Protocol.HTTP, {
    read: function(options) {
        // Show the loading indicator over the map
        $('#loading-indicator').removeClass('hidden');
        $('#loading-indicator').attr('aria-hidden', false);
        // Pass the values of the category, status, and sort fields as query params
        $.each({ filter_category: 'filter_categories', status: 'statuses', sort: 'sort' }, function(key, id) {
            var val = $('#' + id).val();
            if (val !== undefined) {
                options.params = options.params || {};
                options.params[key] = val;
            }
        });
        return OpenLayers.Protocol.HTTP.prototype.read.apply(this, [options]);
    },
    CLASS_NAME: "OpenLayers.Protocol.FixMyStreet"
});

/* Pan data handler */
OpenLayers.Format.FixMyStreet = OpenLayers.Class(OpenLayers.Format.JSON, {
    read: function(json, filter) {
        // Remove loading indicator
        $('#loading-indicator').addClass('hidden');
        $('#loading-indicator').attr('aria-hidden', true);
        if (typeof json == 'string') {
            obj = OpenLayers.Format.JSON.prototype.read.apply(this, [json, filter]);
        } else {
            obj = json;
        }
        var current;
        if (typeof(obj.current) != 'undefined' && (current = document.getElementById('current'))) {
            current.innerHTML = obj.current;
        }
        var reports_list;
        if (typeof(obj.reports_list) != 'undefined' && (reports_list = document.getElementById('js-reports-list'))) {
            reports_list.innerHTML = obj.reports_list;
        }
        if (typeof(obj.pagination) != 'undefined') {
            $('.js-pagination').html(obj.pagination);
        }
        return fixmystreet.maps.markers_list( obj.pins, false );
    },
    CLASS_NAME: "OpenLayers.Format.FixMyStreet"
});

/* Click handler */
OpenLayers.Control.Click = OpenLayers.Class(OpenLayers.Control, {
    defaultHandlerOptions: {
        'single': true,
        'double': false,
        'pixelTolerance': 4,
        'stopSingle': false,
        'stopDouble': false
    },

    initialize: function(options) {
        this.handlerOptions = OpenLayers.Util.extend(
            {}, this.defaultHandlerOptions);
        OpenLayers.Control.prototype.initialize.apply(
            this, arguments
        );
        this.handler = new OpenLayers.Handler.Click(
            this, {
                'click': this.trigger
            }, this.handlerOptions);
    },

    trigger: function(e) {
        // If we are looking at an individual report, and the report was
        // ajaxed into the DOM from the all reports page, then clicking
        // the map background should take us back to the all reports list.
        if ($('.js-back-to-report-list').length) {
            $('.js-back-to-report-list').trigger('click');
            return true;
        }

        var lonlat = fixmystreet.map.getLonLatFromViewPortPx(e.xy);
        fixmystreet.display.begin_report(lonlat);

        if ( typeof ga !== 'undefined' && fixmystreet.cobrand == 'fixmystreet' ) {
            ga('send', 'pageview', { 'page': '/map_click' } );
        }
    }
});

/* Drag handler that allows individual features to disable dragging */
OpenLayers.Control.DragFeatureFMS = OpenLayers.Class(OpenLayers.Control.DragFeature, {
    CLASS_NAME: "OpenLayers.Control.DragFeatureFMS",

    overFeature: function(feature) {
        if (feature.attributes.draggable) {
            return OpenLayers.Control.DragFeature.prototype.overFeature.call(this, feature);
        } else {
            return false;
        }
    }
})

OpenLayers.Renderer.SVGBig = OpenLayers.Class(OpenLayers.Renderer.SVG, {
    MAX_PIXEL: 15E7,
    CLASS_NAME: "OpenLayers.Renderer.SVGBig"

});
