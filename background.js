'use strict';

(function (execute)
{
	var prefDefaults =
	{
		items: [],
		validate: true,
	};
	
	var createApi = function (message)
	{
		var messageClone = JSON.parse(JSON.stringify(message));
		
		var api =
		{
			runAs: function (scope, code, params)
			{
				switch (scope)
				{
				case 'background':
					window.setTimeout(function ()
					{
						execute.call(createRemoteMessage(message, code, params));
					}, 0);
					break;
				
				case 'content':
					browser.tabs.sendMessage(message.tab.id, createRemoteMessage(message, code, params));
					break;
				
				default:
					throw new Error('Unrecognized scope.');
				}
			},
			message: messageClone,
		};
		
		Object.assign(api, messageClone);
		return api;
	};
	
	var createRemoteMessage = function (message, code, params)
	{
		var remoteMessage = {};
		Object.assign(remoteMessage, message);
		
		if (typeof code == 'function')
		{
			code = '('+code.toSource()+').call(this);';
		}
		else
		{
			code += '';
		}
		
		remoteMessage.code = code;
		remoteMessage.params = params === undefined ? null : params;
		return remoteMessage;
	};
	
	var update = function ()
	{
		browser.storage.local.get(prefDefaults).then(function (prefs)
		{
			browser.contextMenus.removeAll(function ()
			{
				prefs.items.forEach(function (item)
				{
					if (item.contexts.length == 0)
					{
						return;
					}
					
					var commonSettings =
					{
						checked: item.checked,
						enabled: item.enabled,
						title: item.title,
						type: item.type,
					};
					
					if (typeof item.icons == 'string')
					{
						commonSettings.icons = {16: item.icons};
					}
					else if (item.icons != null)
					{
						commonSettings.icons = item.icons;
					}
					
					var patterns = item.patterns.replace(/^[\r\n]+|[\r\n]+$/g, '');
					
					if (item.patterns == '')
					{
						patterns = ['<all_urls>'];
					}
					else
					{
						patterns = patterns.split(/[\r\n]+/g);
					}
					
					var pageContexts = [];
					var objectContexts = [];
					
					item.contexts.forEach(function (context)
					{
						switch (context)
						{
							case 'page':
							case 'tab':
							case 'selection':
								pageContexts.push(context);
								break;
							
							default:
								objectContexts.push(context);
						}
					});
					
					if (pageContexts.length > 0)
					{
						browser.contextMenus.create(Object.assign(
						{
							contexts: pageContexts,
							documentUrlPatterns: item.documentUrlPatterns === undefined ? patterns : item.documentUrlPatterns,
							id: item.id+'-page',
							targetUrlPatterns: item.targetUrlPatterns,
						}, commonSettings));
					}
					
					if (objectContexts.length > 0)
					{
						browser.contextMenus.create(Object.assign(
						{
							contexts: objectContexts,
							documentUrlPatterns: item.documentUrlPatterns,
							id: item.id+'-object',
							targetUrlPatterns: item.targetUrlPatterns === undefined ? patterns : item.targetUrlPatterns,
						}, commonSettings));
					}
				});
			});
		});
	};
	
	browser.runtime.onInstalled.addListener(update);
	browser.runtime.onStartup.addListener(update);
	browser.storage.onChanged.addListener(function (prefs)
	{
		if (prefs.items)
		{
			update();
		}
	});
	
	browser.contextMenus.onClicked.addListener(function (info, tab)
	{
		browser.storage.local.get(prefDefaults).then(function (prefs)
		{
			var item = prefs.items[info.menuItemId.replace(/-(?:page|object)$/, '')];
			var message =
			{
				code: item.code,
				info: info,
				itemSettings: item,
				params: null,
				tab: tab,
			};
			
			switch (item.scope)
			{
			case 'background':
				execute.call(createApi(message));
				break;
			
			case 'content':
				browser.tabs.sendMessage(tab.id, message);
				break;
			
			default:
				throw new Error('Unrecognized scope.');
			}
		});
	});
	
	browser.runtime.onMessage.addListener(function (message)
	{
		if (message.code !== undefined)
		{
			execute.call(createApi(message));
		}
	});
})(function ()
{
	eval(this.code);
});
