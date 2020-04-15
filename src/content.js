'use strict';

(function (execute)
{
	/**
	 * Create the API for the user's script.
	 */
	var createAPI = function (message)
	{
		// Deep-clone the message to ensure that the original
		// version is preserved. The messaging API requires
		// JSON-serializability anyway.
		
		var messageClone = JSON.parse(JSON.stringify(message));
		
		var api =
		{
			/**
			 * Asynchronously run user-provided code in the given scope.
			 */
			runAs: function (scope, code, params)
			{
				switch (scope)
				{
				case 'background':
					// Execute the provided code in the background script.
					
					browser.runtime.sendMessage(createRemoteMessage(message, code, params));
					break;
				
				case 'content':
					// Execute the provided code locally.
					
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
	
	/**
	 * Create message to be executed in a different scope.
	 */
	var createRemoteMessage = function (message, code, params)
	{
		var remoteMessage = {};
		Object.assign(remoteMessage, message);
		
		if (typeof code == 'function')
		{
			// The user provided a function instead of a code string.
			// Convert this into a code string so that the function
			// will be called when it's evaled (without any of the
			// lexical scope). "this" should be inherited from where
			// the eval is run.
			
			code = '('+code+').call(this);';
		}
		else
		{
			code += '';
		}
		
		remoteMessage.code = code;
		remoteMessage.params = params === undefined ? null : params;
		return remoteMessage;
	};
	
	// Listen for messages coming from the background script.
	
	browser.runtime.onMessage.addListener(function (message)
	{
		if (message.code !== undefined)
		{
			// We've received a call from the background script.
			
			execute.call(createAPI(message));
		}
	});
})(function ()
{
	// This is where the user's code is executed for content scripts.
	// The function is defined here so it doesn't inherit any of our
	// internal variables. This function should always be called in
	// the context of a createAPI() result.
	
	eval(this.code);
});
