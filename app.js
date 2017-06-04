"use strict";

const config = require('./config')
const portscanner = require('portscanner')
const exec = require('child_process').exec;
const geoip = require('geoip-lite');

const Sequelize = require('sequelize');
const sequelize = new Sequelize(config.db_name, config.db_username, config.db_password);

const Nodes = sequelize.define('monero_nodes', {
    id: {
        primaryKey: true,
        type: Sequelize.INTEGER,
        autoIncrement: true
    },
    ip: {
        type: Sequelize.STRING
    },
    port: {
        type: Sequelize.INTEGER(11).UNSIGNED
    },
    first_seen: {
        type: Sequelize.DATE
    },
    last_seen: {
        type: Sequelize.DATE
    },
    status: {
        type: Sequelize.INTEGER
    },
    country: {
        type: Sequelize.STRING(3)
    },
    lat: {
        type: Sequelize.DECIMAL(10,8)
    },
    lng: {
        type: Sequelize.DECIMAL(11,8)
    }
}, {
    freezeTableName: true // Model tableName will be the same as the model name
});

Nodes.sync();

const peer_list = exec(`${config.monero_daemon} print_pl`);
let result = '';

peer_list.stdout.on('data', function(data) {
    result += data;
});

peer_list.on('close', function(data) {
    result = result.split("\n");

    for (let i = 0; i <= result.length - 1; i++) {

        //we dont want to scan thousand of ip at the same time, right?
        setTimeout(function(i) {

            const line = result[i].toString().split(/\s+/);

            if (line != '') {
                const host = line[2].split(':');
                const ip = host[0];
                const port = host[1];
                //console.log(geoip.lookup(ip).country);

                if (!ValidateIPaddress(ip)) { return }

                portscanner.checkPortStatus(port, ip).then(function(status) {
                    //console.log(status);
                    const geoip_data = geoip.lookup(ip)

                    if (status == 'open') { //else closed
                        Nodes.findOne({
                            where: {
                                ip: ip
                            }
                        }).then(node => {
                            if (node) {
                                node.updateAttributes({
                                    last_seen: sequelize.fn('NOW'),
                                    status: 1,
                                    country: geoip_data.country,
                                    lat: geoip_data.ll[0],
                                    lng: geoip_data.ll[1]
                                })
                            } else {
                                Nodes.create({
                                    ip: ip,
                                    port: port,
                                    first_seen: sequelize.fn('NOW'),
                                    last_seen: sequelize.fn('NOW'),
                                    status: 1,
                                    country: geoip_data.country,
                                    lat: geoip_data.ll[0],
                                    lng: geoip_data.ll[1]
                                })
                            }

                        });
                    } else if (status == 'closed') {
                        Nodes.findOne({
                            where: {
                                ip: ip
                            }
                        }).then(node => {
                            if (node) {
                                node.updateAttributes({
                                    status: 0
                                })
                            }
                        });
                    }

                }).catch(function(e) {
                    console.log(e);
                });

            }

        }, config.scan_interval * i, i);

    }

});


function ValidateIPaddress(ipaddress) {
  if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress)) {
    return (true)
  }
  return (false)
}
