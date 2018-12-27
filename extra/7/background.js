var itemExtensionIds = {};

browser.runtime.onMessageExternal.addListener(function (message, sender)
{
	if (message.type !== 'contextlets:items')
	{
		return;
	}
	
	if (Object.prototype.hasOwnProperty.call(message, 'items'))
	{
		browser.contextMenus.removeAll(function ()
		{
			itemExtensionIds = {};
			
			message.items.forEach(function (item)
			{
				itemExtensionIds[item.id] = sender.id;
				browser.contextMenus.create(item);
			});
		});
	}
});

browser.contextMenus.onClicked.addListener(function (info, tab)
{
	if (Object.prototype.hasOwnProperty.call(itemExtensionIds, info.menuItemId))
	{
		browser.runtime.sendMessage(itemExtensionIds[info.menuItemId],
		{
			type: 'contextlets:clicked',
			info: info,
			tab: tab,
		});
	}
});

var update = function ()
{
	browser.runtime.sendMessage('{dcf34dbe-ccd1-11e7-8f66-ff8971474715}',
	{
		type: 'contextlets:update',
	});
};

browser.runtime.onInstalled.addListener(update);
browser.runtime.onStartup.addListener(update);
