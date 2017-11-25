document.getElementById('privileged-api-list').textContent = browser.runtime.getManifest().permissions.filter(function (value)
{
	return !/[^a-zA-Z0-9._]/.test(value);
}).sort().join(', ');
