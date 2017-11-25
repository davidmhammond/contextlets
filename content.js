'use strict';

(function (execute)
{
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
					browser.runtime.sendMessage(createRemoteMessage(message, code, params));
					break;
				
				case 'content':
					window.setTimeout(function ()
					{
						execute.call(createRemoteMessage(message, code, params));
					}, 0);
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
