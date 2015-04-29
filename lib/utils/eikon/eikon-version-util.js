/**
 * Created by JF on 22/01/14.
 * Edit by NT
 */


var g_fs = require('fs'),
    g_xmldoc = require('xmldoc').XmlDocument,
    g_q = require('q');

exports.getEIKONVersion = function()
{
    var l_deferredReturn = g_q.defer();

    g_fs.readFile("C:\\ProgramData\\Thomson Reuters\\Eikon Data\\EikonRoot.xml", function eikon40VersionCallback(err, data) {
        if(err)
        {
            g_fs.readFile("C:\\ProgramData\\Thomson Reuters\\TRD_8.xml", function eikon3xVersionCallback(err, data){
                if(err)
                {
                    //Windows XP not support Eikon 4
                    g_fs.readFile("C:\\Documents and Settings\\All Users\\Application Data\\Thomson Reuters\\TRD_8.xml", function eikon3xXPVersionCallback(err, data){
                        if(err)
                        {
                            l_deferredReturn.resolve("");
                            return;
                        }
                        else
                        {
                            var product = new g_xmldoc(data);
                            if (typeof product != 'object') {
                                l_deferredReturn.resolve("");
                                return;
                            }
                            l_deferredReturn.resolve(product.valueWithPath('MSIProductVersion'));
                        }
                    });
                    return;
                }
                else
                {
                    var product = new g_xmldoc(data);
                    if (typeof product != 'object') {
                        l_deferredReturn.resolve("");
                        return;
                    }
                    l_deferredReturn.resolve(product.valueWithPath('MSIProductVersion'));
                }
            });
            return;
        }
        var product = new g_xmldoc(data);
        if (typeof product != 'object') {
            l_deferredReturn.resolve("");
            return;
        }
        l_deferredReturn.resolve(product.valueWithPath('CurrentVersion'));
    });
    return l_deferredReturn.promise;
};