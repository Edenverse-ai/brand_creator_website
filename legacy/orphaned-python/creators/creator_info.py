import requests

def get_public_account_insights(access_token, tto_tcm_account_id, handle_name):
    """
    Retrieves the public insights for a TikTok creator using the v1.3 API.

    :param access_token: The access token authorized by TikTok Creator Marketplace
    :param tcm_account_id: Your TikTok Creator Marketplace account ID (string in v1.3)
    :param handle_name: The handle name of the creator you want to search
    :return: JSON response from the API
    """
    url = "https://business-api.tiktok.com/open_api/v1.3/tto/tcm/creator/public/"

    
    headers = {
        "Access-Token": access_token  # Replace with your actual access token
    }
    
    params = {
        "tto_tcm_account_id": tto_tcm_account_id,  # Must be a string in v1.3
        "handle_name": handle_name
    }
    
    response = requests.get(url, headers=headers, params=params)
    
    # Raise an exception if the request was unsuccessful
    response.raise_for_status()
    
    return response.json()

if __name__ == "__main__":
    # Replace with your real access token and tcm_account_id
    MY_ACCESS_TOKEN = "501451aac8e52709146ce1791efe81b15c26cbfe"
    MY_TCM_ACCOUNT_ID = "7491077961832202247"

    # Example handle name for testing
    CREATOR_HANDLE_NAME = "jess.judith"

    try:
        result = get_public_account_insights(
            access_token=MY_ACCESS_TOKEN,
            tto_tcm_account_id=MY_TCM_ACCOUNT_ID,
            handle_name=CREATOR_HANDLE_NAME
        )
        print("Response from API:")
        print(result)
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
    except Exception as err:
        print(f"An error occurred: {err}")
